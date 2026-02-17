import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, Empty, Switch, Tooltip } from 'antd';
import { TeamOutlined, GlobalOutlined, LoadingOutlined } from '@ant-design/icons';
import { Message, Order } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { UnifiedMessageBubble } from './UnifiedMessageBubble';
import { ChatInput } from './ChatInput';
import { formatDate, isClientMessage } from '../utils/chatUtils';
import { useOrderChat } from '../hooks/useOrderChat';

interface UnifiedContactChatProps {
    contactId: number;
    activeOrder?: Order | null;
    isMobile?: boolean;
    showHeader?: boolean;
    contactName?: string;
    style?: React.CSSProperties;
}

interface TimelineMessage extends Message {
    source_type?: 'client' | 'internal';
    sort_date?: string;
    is_system?: boolean;
    display_author?: string;
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

    // Use the unified hook. If no activeOrder, we use the contactId to at least fetch client messages.
    // Note: useOrderChat expects an orderId. We'll pass activeOrder?.id || 0 and handle it.
    const {
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
    } = useOrderChat(activeOrder?.id || 0, activeOrder?.main_id ? String(activeOrder.main_id) : undefined, contactId);

    const [inputMode, setInputMode] = useState<'client' | 'internal'>('client');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number>(0);

    const scrollToBottom = useCallback((smooth = false) => {
        setTimeout(() => {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
            }
        }, 100);
    }, []);

    useEffect(() => {
        if (contactId || activeOrder?.id) {
            fetchTimeline(false);
        }
    }, [contactId, activeOrder?.id, fetchTimeline]);

    useEffect(() => {
        if (!loading && !loadingMore && messages.length > 0 && messages.length <= 50) {
            scrollToBottom(false);
        }
    }, [messages.length, loading, loadingMore, scrollToBottom]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        if (container.scrollTop < 100 && hasMore && !loadingMore && !loading) {
            previousScrollHeightRef.current = container.scrollHeight;
            fetchTimeline(true);
        }
    };

    useEffect(() => {
        if (loadingMore || !messagesContainerRef.current) return;
        const container = messagesContainerRef.current;
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
        if (scrollDiff > 0) {
            container.scrollTop = scrollDiff;
        }
    }, [messages.length, loadingMore]);

    const handleSendText = async (text: string) => {
        const success = await sendMessage(text, inputMode);
        if (success) scrollToBottom(true);
    };

    const parseDateInput = (d: any) => {
        if (!d) return 0;
        if (typeof d === 'string' && !d.includes('Z') && !d.includes('+')) {
            return new Date(d.replace(' ', 'T') + 'Z').getTime();
        }
        return new Date(d).getTime();
    };

    const renderList = () => {
        const displayList = [...messages].sort((a, b) => {
            const da = parseDateInput(a.sort_date || a['Created Date'] || a.created_at);
            const db = parseDateInput(b.sort_date || b['Created Date'] || b.created_at);
            return da - db;
        });

        const groupedMessages: { date: string, msgs: TimelineMessage[] }[] = [];
        displayList.forEach(msg => {
            const d = msg.sort_date || msg['Created Date'] || msg.created_at;
            const dateKey = formatDate(d);
            const lastGroup = groupedMessages[groupedMessages.length - 1];
            if (lastGroup && lastGroup.date === dateKey) {
                lastGroup.msgs.push(msg as TimelineMessage);
            } else {
                groupedMessages.push({ date: dateKey, msgs: [msg as TimelineMessage] });
            }
        });

        return (
            <>
                {loadingMore && <div style={{ textAlign: 'center', marginBottom: 16 }}><Spin size="small" /></div>}
                {groupedMessages.map(group => (
                    <div key={group.date}>
                        <div style={{ textAlign: 'center', margin: '16px 0', opacity: 0.5, fontSize: 12 }}>
                            <span style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
                        </div>
                        {group.msgs.map(msg => {
                            if (msg.is_system) {
                                const sysDate = msg.sort_date || msg.created_at || msg['Created Date'];
                                const sysTime = sysDate ? new Date(sysDate).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                                return (
                                    <div key={`${msg.source_type}_${msg.id}`} style={{ textAlign: 'center', margin: '12px 0' }}>
                                        <div style={{ background: '#f0f0f0', display: 'inline-block', padding: '6px 14px', borderRadius: 16, fontSize: 12, color: '#8c8c8c', maxWidth: '80%', wordWrap: 'break-word' }}>
                                            {msg.content}
                                            {sysTime && <span style={{ display: 'block', fontSize: 10, opacity: 0.7, marginTop: 2 }}>{sysTime}</span>}
                                        </div>
                                    </div>
                                );
                            }

                            const variant = msg.source_type === 'internal' ? 'internal' : 'client';
                            let isOwn = false;
                            if (msg.source_type === 'client') {
                                isOwn = !isClientMessage(msg.author_type);
                            } else {
                                isOwn = msg.sender?.id === manager?.id || msg.manager_id === manager?.id;
                            }

                            const alignment = variant === 'internal' ? (isOwn ? 'right' : 'left') : undefined;

                            let replyCtx: Message | undefined = undefined;
                            if (msg.reply_to_mess_id_tg) {
                                replyCtx = messages.find(m => m.message_id_tg === msg.reply_to_mess_id_tg);
                            } else if ((msg as any).reply_to_id) {
                                replyCtx = messages.find(m => m.id === (msg as any).reply_to_id && m.source_type === 'internal');
                            }

                            return (
                                <UnifiedMessageBubble
                                    key={`${msg.source_type}_${msg.id}`}
                                    msg={msg}
                                    isOwn={isOwn}
                                    onReply={(m) => setReplyTo(m as TimelineMessage)}
                                    onAddReaction={(m, e) => addReaction(m as TimelineMessage, e)}
                                    replyMessage={replyCtx}
                                    variant={variant}
                                    alignment={alignment}
                                />
                            );
                        })}
                    </div>
                ))}
            </>
        );
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#fff',
            borderRadius: isMobile ? 0 : 8,
            border: isMobile ? 'none' : '1px solid #f0f0f0',
            ...style
        }}>
            {showHeader && (
                <div style={{
                    padding: '8px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: isMobile ? 0 : '8px 8px 0 0'
                }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {contactName || 'Чат с клиентом'}
                    </div>
                    {activeOrder && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tooltip title="Переключить режим отправки">
                                <Switch
                                    checkedChildren={<><TeamOutlined /> Свои</>}
                                    unCheckedChildren={<><GlobalOutlined /> Клиент</>}
                                    checked={inputMode === 'internal'}
                                    onChange={(checked) => setInputMode(checked ? 'internal' : 'client')}
                                    style={{ background: inputMode === 'internal' ? '#faad14' : '#1890ff' }}
                                />
                            </Tooltip>
                        </div>
                    )}
                </div>
            )}

            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                style={{
                    flex: 1, overflowY: 'auto', padding: isMobile ? '8px 4px' : 16, background: '#f5f5f5',
                    backgroundImage: 'url("https://gw.alipayobjects.com/zos/rmsportal/FfdJeJRQWjEeGTpqgBKj.png")',
                    backgroundBlendMode: 'overlay',
                }}
            >
                {loading && messages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                ) : messages.length === 0 ? (
                    <Empty description="Нет сообщений" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : renderList()}
                <div ref={messagesEndRef} />
            </div>

            {replyTo && (
                <div style={{ padding: '8px 16px', background: '#f9f9f9', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <div>
                        Ответ на: <b>{replyTo.display_author || (replyTo as any).sender?.name}</b>
                        <div style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#888' }}>
                            {replyTo.content || 'Вложение'}
                        </div>
                    </div>
                    <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer', padding: 0 }}>Отмена</button>
                </div>
            )}

            {activeOrder ? (
                <div style={{ borderLeft: inputMode === 'internal' ? '4px solid #faad14' : '4px solid #1890ff', transition: 'all 0.3s' }}>
                    <ChatInput
                        onSendText={handleSendText}
                        onSendVoice={async (v, d) => { await sendMessage('', inputMode, undefined, v, d); }}
                        onSendFile={async (f, c) => { await sendMessage(c || '', inputMode, f); }}
                        sending={sending}
                        placeholder={inputMode === 'internal' ? "Внутренняя заметка..." : "Написать клиенту..."}
                    />
                </div>
            ) : (
                <div style={{ padding: '16px', textAlign: 'center', background: '#fafafa', borderTop: '1px solid #f0f0f0', color: '#8c8c8c' }}>
                    Выберите активную сделку для отправки сообщений
                </div>
            )}
        </div>
    );
};
