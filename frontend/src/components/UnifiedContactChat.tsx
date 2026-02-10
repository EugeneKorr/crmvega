import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Empty, message as antMessage } from 'antd';
import { Message, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';
import { contactMessagesAPI, orderMessagesAPI, messagesAPI } from '../services/api';
import { supabase } from '../lib/supabase';

interface UnifiedContactChatProps {
    contactId: number;
    activeOrder?: Order | null;
    isMobile?: boolean;
    showHeader?: boolean;
    contactName?: string;
    style?: React.CSSProperties;
}

export const UnifiedContactChat: React.FC<UnifiedContactChatProps> = ({
    contactId,
    activeOrder,
    isMobile = false,
    showHeader = false,
    contactName,
    style
}) => {
    const { manager } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState<Message | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number>(0);
    const isInitialLoadRef = useRef<boolean>(true);

    const scrollToBottom = useCallback((smooth = false) => {
        setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
            }
        }, 100);
    }, []);

    const fetchMessages = async (loadMore = false) => {
        try {
            if (!loadMore) {
                setIsLoadingMessages(true);
                isInitialLoadRef.current = true;
            } else {
                setLoadingMore(true);
                isInitialLoadRef.current = false;
                if (messagesContainerRef.current) {
                    previousScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
                }
            }

            const limit = 50;
            const offset = loadMore ? messages.length : 0;
            const data = await contactMessagesAPI.getByContactId(contactId, { limit, offset });

            if (loadMore) {
                setMessages(prev => [...data.messages, ...prev]);
                setHasMore(data.messages.length >= limit);

                setTimeout(() => {
                    if (messagesContainerRef.current) {
                        const newScrollHeight = messagesContainerRef.current.scrollHeight;
                        const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
                        messagesContainerRef.current.scrollTop = scrollDiff;
                    }
                }, 0);
            } else {
                setMessages(data.messages);
                setHasMore(data.messages.length >= limit);
            }
        } catch (error: any) {
            console.error('Error fetching messages:', error);
            antMessage.error('Ошибка загрузки сообщений');
        } finally {
            setIsLoadingMessages(false);
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (contactId) fetchMessages(false);
    }, [contactId]);

    useEffect(() => {
        if (messages.length > 0 && !isLoadingMessages && !loadingMore && isInitialLoadRef.current) {
            scrollToBottom(true);
            isInitialLoadRef.current = false;
        }
    }, [messages.length, isLoadingMessages, loadingMore, scrollToBottom]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        if (container.scrollTop < 100 && hasMore && !loadingMore && !isLoadingMessages) {
            fetchMessages(true);
        }
    };

    useEffect(() => {
        if (!contactId || !activeOrder) return;

        const channel = supabase
            .channel(`messages:${activeOrder.main_id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `main_id=eq.${activeOrder.main_id}`
                },
                (payload) => {
                    const newMessage = payload.new as Message;
                    setMessages(prev => {
                        const optimisticIndex = prev.findIndex(m => String(m.id).startsWith('temp-'));
                        if (optimisticIndex !== -1) {
                            const updated = [...prev];
                            updated[optimisticIndex] = newMessage;
                            return updated;
                        }
                        if (prev.some(m => String(m.id) === String(newMessage.id))) return prev;
                        return [...prev, newMessage];
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: `main_id=eq.${activeOrder.main_id}`
                },
                (payload) => {
                    const updatedMsg = payload.new as Message;
                    setMessages(prev => prev.map(m => String(m.id) === String(updatedMsg.id) ? { ...m, ...updatedMsg } : m));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [contactId, activeOrder?.main_id]);

    const handleAddReaction = async (msg: Message, emoji: string) => {
        setMessages(prev => prev.map(m => {
            if (String(m.id) === String(msg.id)) {
                const reactions = m.reactions || [];
                return { ...m, reactions: [...reactions, { emoji, author: 'Me', created_at: new Date().toISOString() }] };
            }
            return m;
        }));
        try {
            await messagesAPI.addReaction(msg.id, emoji);
        } catch (error) {
            antMessage.error('Не удалось добавить реакцию');
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!activeOrder?.id || !manager) return;
        setSending(true);
        const optimisticId = `temp-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId as any,
            content: text,
            author_type: 'manager',
            message_type: 'text',
            'Created Date': new Date().toISOString(),
            is_read: true,
            main_id: activeOrder.main_id,
            manager_id: manager.id,
            status: 'pending' as any,
            reply_to_mess_id_tg: replyTo?.message_id_tg,
            reply_to_id: replyTo?.id
        };
        setMessages(prev => [...prev, optimisticMessage]);
        scrollToBottom();
        const currentReplyTo = replyTo;
        setReplyTo(null);

        try {
            await orderMessagesAPI.sendClientMessage(activeOrder.id, text, Number(currentReplyTo?.message_id_tg) || undefined);
        } catch (error: any) {
            setMessages(prev => prev.filter(m => String(m.id) !== String(optimisticId)));
            antMessage.error('Ошибка отправки');
        } finally {
            setSending(false);
        }
    };

    const handleSendVoice = async (voice: Blob, duration: number) => {
        if (!activeOrder?.id) return;
        setSending(true);
        const optimisticId = `temp-voice-${Date.now()}`;
        const optimisticMessage: Message = {
            id: optimisticId as any,
            content: '',
            author_type: 'manager',
            message_type: 'voice',
            'Created Date': new Date().toISOString(),
            is_read: true,
            main_id: activeOrder.main_id,
            status: 'pending' as any,
            voice_duration: duration,
            attachment_url_internal: URL.createObjectURL(voice),
            reply_to_mess_id_tg: replyTo?.message_id_tg,
            reply_to_id: replyTo?.id
        };
        setMessages(prev => [...prev, optimisticMessage]);
        scrollToBottom();
        const currentReplyTo = replyTo;
        setReplyTo(null);
        try {
            await orderMessagesAPI.sendClientVoice(activeOrder.id, voice, duration, Number(currentReplyTo?.message_id_tg) || undefined);
        } catch (error) {
            setMessages(prev => prev.filter(m => String(m.id) !== String(optimisticId)));
            antMessage.error('Ошибка отправки ГС');
        } finally {
            setSending(false);
        }
    };

    const handleSendFile = async (file: File, caption?: string) => {
        if (!activeOrder?.id) return;
        setSending(true);
        const optimisticId = `temp-file-${Date.now()}`;
        const isImage = file.type.startsWith('image/');
        const optimisticMessage: Message = {
            id: optimisticId as any,
            content: caption || '',
            author_type: 'manager',
            message_type: isImage ? 'image' : 'file',
            'Created Date': new Date().toISOString(),
            is_read: true,
            main_id: activeOrder.main_id,
            status: 'pending' as any,
            attachment_url_internal: URL.createObjectURL(file), // Support image preview instantly
            reply_to_mess_id_tg: replyTo?.message_id_tg,
            reply_to_id: replyTo?.id
        };
        setMessages(prev => [...prev, optimisticMessage]);
        scrollToBottom();
        const currentReplyTo = replyTo;
        setReplyTo(null);
        try {
            await orderMessagesAPI.sendClientFile(activeOrder.id, file, caption, Number(currentReplyTo?.message_id_tg) || undefined);
        } catch (error: any) {
            setMessages(prev => prev.filter(m => String(m.id) !== String(optimisticId)));
            antMessage.error('Ошибка отправки файла');
        } finally {
            setSending(false);
        }
    };

    const renderMessages = () => {
        const groupedMessages: { date: string, msgs: Message[] }[] = [];
        messages.forEach(msg => {
            const dateKey = formatDate(msg['Created Date'] || msg.created_at);
            const lastGroup = groupedMessages[groupedMessages.length - 1];
            if (lastGroup && lastGroup.date === dateKey) {
                lastGroup.msgs.push(msg);
            } else {
                groupedMessages.push({ date: dateKey, msgs: [msg] });
            }
        });

        return groupedMessages.map(group => (
            <div key={group.date}>
                <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
                    <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
                </div>
                {group.msgs.map((msg, index) => {
                    const isOwn = !isClientMessage(msg.author_type);
                    let replyCtx: Message | undefined = undefined;
                    if (msg.reply_to_mess_id_tg) {
                        replyCtx = messages.find(m => String(m.message_id_tg) === String(msg.reply_to_mess_id_tg));
                    }
                    if (!replyCtx && (msg.reply_to_id || msg.reply_to?.id)) {
                        const rId = msg.reply_to_id || msg.reply_to?.id;
                        replyCtx = messages.find(m => String(m.id) === String(rId));
                    }
                    return (
                        <UnifiedMessageBubble
                            key={msg.id || index}
                            msg={msg}
                            replyMessage={replyCtx}
                            isOwn={isOwn}
                            variant="client"
                            onAddReaction={handleAddReaction}
                            onReply={(m) => setReplyTo(m)}
                        />
                    );
                })}
            </div>
        ));
    };

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            minHeight: 0,
            ...style
        }}>
            {showHeader && (
                <div style={{ padding: isMobile ? '12px 16px' : '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{contactName || 'Чат с клиентом'}</div>
                </div>
            )}

            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1, padding: isMobile ? '12px' : '24px', overflowY: 'auto', background: '#f5f5f5',
                    backgroundImage: 'url("https://gw.alipayobjects.com/zos/rmsportal/FfdJeJRQWjEeGTpqgBKj.png")',
                    backgroundBlendMode: 'overlay',
                }}
            >
                {isLoadingMessages ? (
                    <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
                ) : (
                    <>
                        {loadingMore && <div style={{ textAlign: 'center', marginBottom: 16 }}><Spin size="small" /></div>}
                        {messages.length === 0 ? <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : renderMessages()}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {activeOrder && (
                <ChatInput
                    onSendText={handleSendMessage}
                    onSendVoice={handleSendVoice}
                    onSendFile={handleSendFile}
                    sending={sending}
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                />
            )}
        </div>
    );
};
