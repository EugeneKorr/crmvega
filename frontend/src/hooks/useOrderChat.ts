import { useState, useEffect, useRef, useCallback } from 'react';
import { message as antMessage } from 'antd';
import { orderMessagesAPI, messagesAPI } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { Message, InternalMessage } from '../types';
import { useAuth } from '../contexts/AuthContext';

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

export const useOrderChat = (orderId: number, mainId?: string, contactId?: number) => {
    const { manager } = useAuth();
    const { socket } = useSocket();

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
        try {
            if (!loadMore) setLoading(true);
            else setLoadingMore(true);

            const limit = 50;
            let before: string | undefined = undefined;

            if (loadMore && messagesRef.current.length > 0) {
                const oldest = messagesRef.current[messagesRef.current.length - 1];
                before = oldest.sort_date || oldest.created_at || oldest['Created Date'];
            }

            const response = await orderMessagesAPI.getTimeline(orderId, { limit, before });
            const fetched = response.messages as TimelineMessage[];

            if (loadMore) {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id + '_' + (m.source_type || 'c')));
                    const newMsgs = fetched.filter(m => !existingIds.has(m.id + '_' + (m.source_type || 'c')));
                    return [...prev, ...newMsgs];
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

    // Mark as read ONLY once when orderId changes, not on every fetch
    useEffect(() => {
        if (!orderId) return;
        try {
            orderMessagesAPI.markAsRead(orderId);
            orderMessagesAPI.markClientMessagesAsRead(orderId);
        } catch (e) { }
    }, [orderId]);

    // Actions
    const sendMessage = async (content: string, mode: 'client' | 'internal', file?: File, voice?: Blob, voiceDuration?: number) => {
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
            lead_id: String(orderId),
            file_url: file ? URL.createObjectURL(file) : undefined,
            reply_to: replyTo ? {
                id: replyTo.id,
                content: replyTo.content,
                author_name: replyTo.display_author
            } : undefined
        };

        // 2. Add to UI immediately
        setMessages(prev => [optimisticMsg, ...prev]);
        setReplyTo(null);

        try {
            if (mode === 'client') {
                const replyId = replyTo && 'message_id_tg' in replyTo ? replyTo.message_id_tg as number : undefined;

                if (voice) {
                    await orderMessagesAPI.sendClientVoice(orderId, voice, voiceDuration, replyId);
                } else if (file) {
                    await orderMessagesAPI.sendClientFile(orderId, file, content, replyId);
                } else {
                    await orderMessagesAPI.sendClientMessage(orderId, content, replyId);
                }
            } else {
                const replyId = replyTo ? replyTo.id : undefined;

                if (voice) {
                    await orderMessagesAPI.sendInternalVoice(orderId, voice, voiceDuration);
                } else if (file) {
                    await orderMessagesAPI.sendInternalFile(orderId, file, replyId);
                    if (content) await orderMessagesAPI.sendInternalMessage(orderId, content, replyId);
                } else {
                    await orderMessagesAPI.sendInternalMessage(orderId, content, replyId);
                }
            }
            // Success: the real message will arrive via socket and deduplicate tempId
            return true;
        } catch (error) {
            console.error('Send error:', error);
            // Mark as error
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, isPending: false, error: true } : m));
            antMessage.error('Ошибка отправки');
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

    // Socket
    useEffect(() => {
        if (!socket) return;

        socket.emit('join_order', orderId.toString());
        if (mainId) socket.emit('join_main', mainId);
        if (contactId) socket.emit('join_contact', contactId.toString());

        const handleNewMessage = (msg: TimelineMessage) => {
            setMessages(prev => {
                // Deduplication: check if message ID already exists or content matches a pending message
                if (prev.some(m => m.id === msg.id && m.source_type === msg.source_type)) return prev;

                // If it's our own message coming back, remove the pending one
                const filtered = prev.filter(m => !(m.isPending && m.content === msg.content && m.source_type === msg.source_type));
                return [msg, ...filtered]; // Newest first
            });
        };

        const handleClientMsg = (msg: any) => {
            const matchesMainId = mainId && msg.main_id && String(msg.main_id) === String(mainId);
            const matchesContactId = contactId && msg.contact_id && Number(msg.contact_id) === Number(contactId);
            if (matchesMainId || matchesContactId) {
                handleNewMessage({ ...msg, source_type: 'client', sort_date: msg['Created Date'] || msg.created_at, display_author: 'Клиент' });
            }
        };

        const handleInternalMsg = (msg: any) => {
            if (msg.order_id && Number(msg.order_id) === Number(orderId)) {
                handleNewMessage({
                    ...msg,
                    source_type: 'internal',
                    sort_date: msg.created_at,
                    is_system: msg.attachment_type === 'system',
                    display_author: msg.sender?.name || 'Система',
                    author_type: msg.sender?.name || 'Manager'
                });
            }
        };

        const handleUpdate = (updatedMsg: Message) => {
            setMessages(prev => prev.map(m => Number(m.id) === Number(updatedMsg.id) ? { ...m, ...updatedMsg, content: updatedMsg.content || m.content } : m));
        };

        socket.on('new_client_message', handleClientMsg);
        socket.on('new_internal_message', handleInternalMsg);
        socket.on('new_message_bubble', (msg: any) => {
            if (mainId && String(msg.main_id) === String(mainId)) {
                handleNewMessage({ ...msg, source_type: 'client', sort_date: msg['Created Date'], display_author: 'Клиент' });
            }
        });
        socket.on('message_updated', (msg: any) => handleUpdate(msg));

        return () => {
            socket.emit('leave_order', orderId.toString());
            socket.off('new_client_message', handleClientMsg);
            socket.off('new_internal_message', handleInternalMsg);
        };
    }, [socket, orderId, mainId, contactId]);

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
