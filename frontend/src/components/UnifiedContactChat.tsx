import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Empty, message as antMessage } from 'antd';
import { Message, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';
import { contactMessagesAPI, orderMessagesAPI } from '../services/api';
import { supabase } from '../lib/supabase';

interface UnifiedContactChatProps {
    contactId: number;
    activeOrder?: Order | null;
    isMobile?: boolean;
    showHeader?: boolean;
    contactName?: string;
}

/**
 * Unified chat component that shows ALL messages for a contact (from all orders).
 * Features:
 * - Telegram-style infinite scroll (auto-load on scroll to top)
 * - Optimistic UI for sent messages
 * - Supabase realtime for live updates
 * - Prepends old messages at the top
 * - Preserves scroll position after loading
 */
export const UnifiedContactChat: React.FC<UnifiedContactChatProps> = ({
    contactId,
    activeOrder,
    isMobile = false,
    showHeader = false,
    contactName
}) => {
    const { manager } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [totalMessages, setTotalMessages] = useState(0);
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number>(0);
    const isInitialLoadRef = useRef<boolean>(true);

    // Scroll to bottom
    const scrollToBottom = useCallback((smooth = false) => {
        setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
            }
        }, 100);
    }, []);

    // Fetch messages for contact
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
                // Prepend old messages at the TOP
                setMessages(prev => [...data.messages, ...prev]);
                setHasMore(data.messages.length >= limit);

                // Restore scroll position after DOM updates
                setTimeout(() => {
                    if (messagesContainerRef.current) {
                        const newScrollHeight = messagesContainerRef.current.scrollHeight;
                        const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
                        messagesContainerRef.current.scrollTop = scrollDiff;
                    }
                }, 0);
            } else {
                setMessages(data.messages);
                setTotalMessages(data.total);
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

    // Initial load
    useEffect(() => {
        if (contactId) {
            fetchMessages(false);
        }
    }, [contactId]);

    // Auto-scroll to bottom ONLY on initial load
    useEffect(() => {
        if (messages.length > 0 && !isLoadingMessages && !loadingMore && isInitialLoadRef.current) {
            scrollToBottom(true);
            isInitialLoadRef.current = false;
        }
    }, [messages.length, isLoadingMessages, loadingMore, scrollToBottom]);

    // Infinite scroll: load more when scrolling near top
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        if (container.scrollTop < 100 && hasMore && !loadingMore && !isLoadingMessages) {
            fetchMessages(true);
        }
    };

    // Supabase realtime subscription for messages
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
                        // Replace optimistic message or add new
                        const optimisticIndex = prev.findIndex(m => String(m.id).startsWith('temp-'));
                        if (optimisticIndex !== -1) {
                            const updated = [...prev];
                            updated[optimisticIndex] = newMessage;
                            return updated;
                        }
                        // Avoid duplicates
                        if (prev.some(m => m.id === newMessage.id)) return prev;
                        return [...prev, newMessage];
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [contactId, activeOrder?.main_id]);

    // Send message handlers
    const handleSendMessage = async (text: string) => {
        if (!activeOrder?.id || !manager) return;

        setSending(true);

        // Optimistic UI: add message immediately
        const optimisticMessage: Message = {
            id: `temp-${Date.now()}` as any,
            content: text,
            author_type: 'manager',
            message_type: 'text',
            'Created Date': new Date().toISOString(),
            is_read: true,
            main_id: activeOrder.main_id,
            manager_id: manager.id,
            lead_id: String(activeOrder.id),
            status: 'pending' as any
        };

        setMessages(prev => [...prev, optimisticMessage]);
        scrollToBottom();

        try {
            await orderMessagesAPI.sendClientMessage(activeOrder.id, text);
        } catch (error: any) {
            console.error('Error sending message:', error);
            antMessage.error('Ошибка отправки сообщения');
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        } finally {
            setSending(false);
        }
    };

    const handleSendVoice = async (voice: Blob, duration: number) => {
        if (!activeOrder?.id) return;
        setSending(true);
        try {
            await orderMessagesAPI.sendClientVoice(activeOrder.id, voice, duration);
            scrollToBottom();
        } catch (error: any) {
            console.error('Error sending voice:', error);
            antMessage.error('Ошибка отправки голосового');
        } finally {
            setSending(false);
        }
    };

    const handleSendFile = async (file: File, caption?: string) => {
        if (!activeOrder?.id) return;
        setSending(true);
        try {
            await orderMessagesAPI.sendClientFile(activeOrder.id, file, caption);
            scrollToBottom();
        } catch (error: any) {
            console.error('Error sending file:', error);
            antMessage.error('Ошибка отправки файла');
        } finally {
            setSending(false);
        }
    };

    // Render messages grouped by date
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
                    return (
                        <UnifiedMessageBubble
                            key={msg.id || index}
                            msg={msg}
                            isOwn={isOwn}
                            variant="client"
                        />
                    );
                })}
            </div>
        ));
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff'
        }}>
            {/* Optional Header */}
            {showHeader && (
                <div style={{
                    padding: isMobile ? '12px 16px' : '16px 24px',
                    borderBottom: '1px solid #f0f0f0',
                    background: '#fafafa'
                }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {contactName || 'Чат с клиентом'}
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    padding: isMobile ? '12px' : '24px',
                    overflowY: 'auto',
                    background: '#f5f5f5',
                    backgroundImage: 'url("https://gw.alipayobjects.com/zos/rmsportal/FfdJeJRQWjEeGTpqgBKj.png")',
                    backgroundBlendMode: 'overlay',
                }}
            >
                {isLoadingMessages ? (
                    <div style={{ textAlign: 'center', marginTop: 40 }}><Spin /></div>
                ) : (
                    <>
                        {loadingMore && (
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <Spin size="small" />
                            </div>
                        )}
                        {messages.length === 0 ? (
                            <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            renderMessages()
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Chat Input */}
            {activeOrder && (
                <ChatInput
                    onSendText={handleSendMessage}
                    onSendVoice={handleSendVoice}
                    onSendFile={handleSendFile}
                    sending={sending}
                />
            )}
        </div>
    );
};
