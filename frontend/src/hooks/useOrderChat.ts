import { useState, useEffect, useRef, useCallback } from 'react';
import { message as antMessage } from 'antd';
import { orderMessagesAPI, messagesAPI } from '../services/api';
import { Message } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js';

interface TimelineMessage extends Message {
    source_type?: 'client' | 'internal';
    sort_date?: string;
    is_system?: boolean;
    display_author?: string;
    isPending?: boolean;
    error?: boolean;
    reply_to?: {
        id: number;
        content: string;
        author_name?: string;
    };
}

// Helper to determine if message is from client
const isClientMessage = (type?: string) => {
    return ['user', 'client', 'customer', 'Клиент'].includes(type || '');
};

export const useOrderChat = (orderId: number, mainId?: string, contactId?: number) => {
    const { manager } = useAuth();

    const [messages, setMessages] = useState<TimelineMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState<TimelineMessage | null>(null);

    const messagesRef = useRef<TimelineMessage[]>([]);
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const fetchTimeline = useCallback(async (loadMore = false) => {
        if (!orderId) return;
        try {
            if (!loadMore) setLoading(true);
            else setLoadingMore(true);

            const limit = 50;
            let before: string | undefined = undefined;

            // For loadMore, get the oldest message's date (first element, since array is ascending)
            if (loadMore && messagesRef.current.length > 0) {
                const oldest = messagesRef.current[0];
                before = oldest.sort_date || oldest.created_at || oldest['Created Date'];
            }

            const response = await orderMessagesAPI.getTimeline(orderId, { limit, before });
            const fetched = (response.messages as TimelineMessage[]).reverse(); // API returns desc, we need asc

            if (loadMore) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id + '_' + (m.source_type || 'c')));
                    const newMsgs = fetched.filter(m => !existingIds.has(m.id + '_' + (m.source_type || 'c')));
                    return [...newMsgs, ...prev]; // Older messages go BEFORE current ones
                });
            } else {
                setMessages(fetched);
            }

            setHasMore(response.meta.has_more);
        } catch (error) {
            console.error('Error fetching timeline:', error);
        } finally {
            if (!loadMore) setLoading(false);
            else setLoadingMore(false);
        }
    }, [orderId]);

    // Auto-fetch messages and mark as read when orderId changes
    useEffect(() => {
        if (!orderId) return;
        fetchTimeline();
        try {
            orderMessagesAPI.markAsRead(orderId);
            orderMessagesAPI.markClientMessagesAsRead(orderId);
        } catch (e) { }
    }, [orderId, fetchTimeline]);

    // Actions
    const sendMessage = async (content: string, mode: 'client' | 'internal', file?: File, voice?: Blob, voiceDuration?: number) => {
        if (!orderId) {
            antMessage.error('Нет активной заявки для отправки');
            return false;
        }

        // Don't send empty messages without attachments
        if (!content?.trim() && !file && !voice) {
            return false;
        }

        const tempId = Date.now();
        const now = new Date().toISOString();

        // 1. Create Optimistic Message
        const optimisticMsg: TimelineMessage = {
            id: tempId,
            content: content || (file ? `Файл: ${file.name}` : voice ? 'Голосовое сообщение' : ''),
            created_at: now,
            sort_date: now,
            source_type: mode,
            display_author: mode === 'internal' ? (manager?.name || 'Вы') : 'Менеджер',
            author_type: mode === 'internal' ? 'manager' : 'user',
            isPending: true,
            main_id: String(orderId),
            file_url: file ? URL.createObjectURL(file) : undefined,
            reply_to: replyTo ? {
                id: replyTo.id,
                content: replyTo.content,
                author_name: replyTo.display_author
            } : undefined,
            sender: manager || undefined
        };

        // 2. Add to UI immediately
        setMessages(prev => [...prev, optimisticMsg]); // Append at end (ascending order)
        setReplyTo(null);

        try {
            if (mode === 'client') {
                const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;

                if (voice) {
                    await orderMessagesAPI.sendClientVoice(orderId, voice, voiceDuration, replyId);
                } else if (file) {
                    await orderMessagesAPI.sendClientFile(orderId, file, content, replyId);
                } else if (content && content.trim()) {
                    await orderMessagesAPI.sendClientMessage(orderId, content, replyId);
                }
            } else {
                const replyId = replyTo ? replyTo.id : undefined;

                if (voice) {
                    await orderMessagesAPI.sendInternalVoice(orderId, voice, voiceDuration);
                } else if (file) {
                    await orderMessagesAPI.sendInternalFile(orderId, file, replyId);
                    if (content) await orderMessagesAPI.sendInternalMessage(orderId, content, replyId);
                } else if (content && content.trim()) {
                    await orderMessagesAPI.sendInternalMessage(orderId, content, replyId);
                }
            }
            // Success: the real message will arrive via Supabase Realtime and deduplicate tempId
            return true;
        } catch (error: any) {
            const serverError = error?.response?.data?.error || error?.message || 'Неизвестная ошибка';
            console.error('Send error:', serverError, error);
            // Mark as error
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isPending: false, error: true } : m));
            antMessage.error(`Ошибка отправки: ${serverError}`);
            return false;
        }
    };

    const addReaction = async (msgId: number, emoji: string) => {
        // Optimistic
        setMessages(prev => prev.map(m => {
            if (m.id === msgId) {
                const currentReactions = m.reactions || [];
                const otherReactions = currentReactions.filter(r => r.author_id !== manager?.id);
                const myExisting = currentReactions.find(r => r.author_id === manager?.id);

                let newReactions = [...otherReactions];
                if (myExisting?.emoji !== emoji) {
                    newReactions.push({ emoji, author: manager?.name || 'Me', author_id: manager?.id, created_at: new Date().toISOString() });
                }
                return { ...m, reactions: newReactions };
            }
            return m;
        }));

        try {
            await messagesAPI.addReaction(msgId, emoji);
        } catch (e) { console.error(e); }
    };

    // Subscriptions
    useEffect(() => {
        if (!orderId) return;

        // Fetch user cache helper
        const fetchSenderIfNeeded = async (managerId?: number | string): Promise<any> => {
            if (!managerId) return null;
            // Simple approach: You could cache managers in a context or store. 
            // For now, we assume manager info comes with initial load, 
            // but for realtime events we might miss it.
            // If sender is current user, we have it.
            if (String(managerId) === String(manager?.id)) return manager;
            return null; // or fetch user API?
        };

        const handleNewMessage = (msg: TimelineMessage) => {
            setMessages(prev => {
                // Deduplication
                if (prev.some(m => m.id === msg.id && m.source_type === msg.source_type)) return prev;

                // If it's our own message coming back, remove the pending one match by content usually
                // But simplified: 
                const filtered = prev.filter(m => !(m.isPending && m.content === msg.content && m.source_type === msg.source_type));
                return [...filtered, msg];
            });
        };

        const channel = supabase.channel(`order_timeline:${orderId}`)
            // 1. Client Messages (table: messages)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: mainId ? `main_id=eq.${mainId}` : undefined
                },
                async (payload: RealtimePostgresInsertPayload<Message>) => {
                    const newMsg = payload.new;
                    // Need to map to TimelineMessage
                    // Note: payload.new does NOT include joins (sender).
                    // We might need to fetch the full message or approximate.
                    // For now, let's try to construct it.

                    // IMPORTANT: If author_type is manager, we need sender.
                    // If we are the sender, we know who we are.
                    const isOwn = String(newMsg.manager_id) === String(manager?.id);
                    const sender = isOwn ? manager : undefined; // We miss other managers info here without fetch!

                    const timelineMsg: TimelineMessage = {
                        ...newMsg,
                        source_type: 'client',
                        sort_date: newMsg['Created Date'] || newMsg.created_at,
                        display_author: isClientMessage(newMsg.author_type) ? 'Клиент' : (sender?.name || 'Менеджер'),
                        sender: sender || undefined
                    };
                    handleNewMessage(timelineMsg);
                }
            )
            // 2. Internal Messages (table: internal_messages)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'internal_messages',
                    filter: `order_id=eq.${orderId}`
                },
                (payload: RealtimePostgresInsertPayload<any>) => {
                    const newMsg = payload.new;
                    const isOwn = String(newMsg.sender_id) === String(manager?.id);
                    const sender = isOwn ? manager : undefined;

                    const timelineMsg: TimelineMessage = {
                        ...newMsg,
                        source_type: 'internal',
                        sort_date: newMsg.created_at,
                        is_system: newMsg.attachment_type === 'system',
                        display_author: (sender?.name || 'Система'),
                        author_type: 'manager',
                        sender: sender || undefined,
                        message_type: 'text' // default
                    };
                    handleNewMessage(timelineMsg);
                }
            )
            // 3. Updates (e.g. reactions, is_read)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: mainId ? `main_id=eq.${mainId}` : undefined
                },
                (payload: RealtimePostgresUpdatePayload<Message>) => {
                    const updated = payload.new;
                    setMessages(prev => prev.map(m =>
                        (String(m.id) === String(updated.id) && m.source_type === 'client')
                            ? { ...m, ...updated, content: updated.content || m.content }
                            : m
                    ));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [orderId, mainId, manager]);

    return {
        messages,
        loading,
        loadingMore,
        hasMore,
        sending,
        replyTo,
        setReplyTo,
        fetchTimeline,
        sendMessage,
        addReaction
    };
};
