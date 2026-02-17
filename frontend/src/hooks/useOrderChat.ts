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

const parseMessageDate = (m: any) => {
    const d = m.sort_date || m.created_at || m['Created Date'];
    if (!d) return 0;
    if (typeof d === 'string' && !d.includes('Z') && !d.includes('+')) {
        return new Date(d.replace(' ', 'T') + 'Z').getTime();
    }
    return new Date(d).getTime();
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
        if (!orderId && !contactId) return;
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

            const response = await orderMessagesAPI.getTimeline(orderId, { limit, before, contactId });
            const fetched = (response.messages as TimelineMessage[]);

            setMessages(prev => {
                const newList = loadMore ? [...fetched, ...prev] : fetched;

                // Deduplication and Pending Cleanup
                const seen = new Set<string>();
                const combined: TimelineMessage[] = [];

                // Sort everything first to make deduplication consistent
                const sorted = [...newList].sort((a, b) => parseMessageDate(a) - parseMessageDate(b));

                for (const m of sorted) {
                    const uid = `${m.id}_${m.source_type || 'c'}`;

                    // If it's a real message, check if we have a pending version of it
                    if (!m.isPending) {
                        // Check if we have a pending message with same content and type
                        const pendingIdx = combined.findIndex(ex =>
                            ex.isPending &&
                            ex.content === m.content &&
                            ex.source_type === m.source_type
                        );
                        if (pendingIdx !== -1) {
                            combined.splice(pendingIdx, 1);
                        }
                    }

                    if (!seen.has(uid)) {
                        seen.add(uid);
                        combined.push(m);
                    }
                }

                return combined.sort((a, b) => parseMessageDate(a) - parseMessageDate(b));
            });

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
        const foundMsg = messagesRef.current.find(m => m.id === msgId);
        const msgType = foundMsg?.source_type || 'client';

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
            await messagesAPI.addReaction(msgId, emoji, msgType);
        } catch (e) {
            console.error(e);
            // Revert on error? For now just log
        }
    };

    // Subscriptions
    useEffect(() => {
        if (!orderId) return;

        const handleNewMessage = (msg: TimelineMessage) => {
            setMessages(prev => {
                // Deduplication
                const msgUniqueId = msg.id + '_' + (msg.source_type || 'c');
                if (prev.some(m => (m.id + '_' + (m.source_type || 'c')) === msgUniqueId)) return prev;

                // If it's our own message coming back, remove the pending one match by content usually
                const filtered = prev.filter(m => !(m.isPending && m.content === msg.content && m.source_type === msg.source_type));

                // Sort by date to maintain order (Oldest first)
                const newList = [...filtered, msg].sort((a, b) => parseMessageDate(a) - parseMessageDate(b));
                return newList;
            });
        };

        let channel: any;

        const setup = async () => {
            let internalIdForSub = String(orderId);

            // If orderId seems to be a main_id (long number), resolve numeric id
            if (Number(orderId) > 1000000000) {
                const { data } = await supabase.from('orders').select('id').eq('main_id', orderId).maybeSingle();
                if (data?.id) internalIdForSub = String(data.id);
            }

            channel = supabase.channel(`order_timeline:${orderId}`)
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: mainId ? `main_id=eq.${mainId}` : undefined
                }, (payload: any) => {
                    const newMsg = payload.new;
                    const isOwn = String(newMsg.manager_id) === String(manager?.id);
                    const sender = isOwn ? manager : undefined;
                    const timelineMsg: TimelineMessage = {
                        ...newMsg,
                        source_type: 'client',
                        sort_date: newMsg['Created Date'] || newMsg.created_at,
                        display_author: isClientMessage(newMsg.author_type) ? 'Клиент' : (sender?.name || 'Менеджер'),
                        sender: sender || undefined
                    };
                    handleNewMessage(timelineMsg);
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'internal_messages',
                    filter: mainId ? `main_id=eq.${mainId}` : `order_id=eq.${internalIdForSub}`
                }, (payload: any) => {
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
                        message_type: newMsg.attachment_type === 'system' ? 'system' : 'text'
                    };
                    handleNewMessage(timelineMsg);
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: mainId ? `main_id=eq.${mainId}` : undefined
                }, (payload: any) => {
                    const updated = payload.new;
                    setMessages(prev => prev.map(m =>
                        (String(m.id) === String(updated.id) && m.source_type === 'client')
                            ? { ...m, ...updated, content: updated.content || m.content }
                            : m
                    ));
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'internal_messages',
                    filter: mainId ? `main_id=eq.${mainId}` : `order_id=eq.${internalIdForSub}`
                }, (payload: any) => {
                    const updated = payload.new;
                    setMessages(prev => prev.map(m =>
                        (String(m.id) === String(updated.id) && m.source_type === 'internal')
                            ? { ...m, ...updated, content: updated.content || m.content }
                            : m
                    ));
                })
                .subscribe();
        };

        setup();

        return () => {
            if (channel) supabase.removeChannel(channel);
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
