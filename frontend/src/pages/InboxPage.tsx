import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { contactsAPI, contactMessagesAPI, orderMessagesAPI, ordersAPI, messagesAPI } from '../services/api';
import { InboxContact, Message, Order, ORDER_STATUSES } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Layout,
    List,
    Input,
    Avatar,
    Button,
    Spin,
    Typography,
    Empty,
    Tag,
    Space,
    message as antMessage,
    Grid
} from 'antd';
import {
    SearchOutlined,
    UserOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import { UnifiedMessageBubble } from '../components/UnifiedMessageBubble';
import { ChatInput } from '../components/ChatInput';
import { formatDate, formatTime, isClientMessage } from '../utils/chatUtils';
import { useOrderChat } from '../hooks/useOrderChat';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;
type Socket = ReturnType<typeof io>;

interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
    last_message_at?: string;
    avatar_url?: string;
}

const InboxPage: React.FC = () => {
    const { manager } = useAuth();
    const { socket } = useSocket();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [activeOrder, setActiveOrder] = useState<Order | null>(null); // Активная заявка контакта
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sending, setSending] = useState(false);

    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [filterStages, setFilterStages] = useState<string[]>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const selectedContactRef = useRef<number | null>(null);
    const previousScrollHeightRef = useRef<number>(0);
    const isInitialLoadRef = useRef<boolean>(true);

    const [totalMessages, setTotalMessages] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Use useOrderChat ONLY for sending messages (optimistic UI)
    const { sendMessage: hookSendMessage } = useOrderChat(activeOrder?.id || 0, activeOrder?.main_id, selectedContact?.id);

    // Initial load & URL params
    useEffect(() => {
        const filterParam = searchParams.get('filter');
        if (filterParam === 'unread') {
            setShowUnreadOnly(true);
            // Load user settings for stages
            if (manager) {
                const stored = localStorage.getItem(`crm_notification_settings_${manager.id}`);
                if (stored) {
                    try {
                        const s = JSON.parse(stored);
                        if (!s.all_active && s.statuses?.length > 0) {
                            setFilterStages(s.statuses);
                        }
                    } catch (e) { }
                }
            }
        }
    }, [searchParams, manager]);

    // Initial load
    useEffect(() => {
        fetchContacts();
    }, [showUnreadOnly, filterStages, searchQuery]);

    useEffect(() => {
        if (!socket) return;
        // Global socket handlers for contact list updates
        const handleGlobalUpdate = (msg: any) => {
            fetchContacts(); // Simply refresh list on new message to keep it simple and accurate
        };
        socket.on('new_message_global', handleGlobalUpdate);
        return () => {
            socket.off('new_message_global', handleGlobalUpdate);
        };
    }, [socket]);

    // Handle URL param selection
    useEffect(() => {
        const contactIdFromUrl = searchParams.get('contactId');
        if (contactIdFromUrl) {
            const id = Number(contactIdFromUrl);
            // ONLY select if NOT already exactly this contact in ref
            if (id && selectedContactRef.current !== id) {
                // Wait for contacts to be loaded
                if (contacts.length > 0) {
                    const contact = contacts.find(c => c.id === id);
                    if (contact) {
                        selectContact(contact);
                    }
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams, contacts.length]);

    const fetchContacts = async () => {
        try {
            setIsLoadingContacts(true);
            const contactsData = await contactsAPI.getSummary({ limit: 100, search: searchQuery });

            let filteredContacts = contactsData;

            // 1. Base Filter (Hide completed/duplicates unless specifically searching or requested?)
            if (!searchQuery) {
                filteredContacts = filteredContacts.filter(c => {
                    const status = c.last_order_status;
                    return status !== 'completed' && status !== 'duplicate';
                });
            }

            // 2. Unread Filter
            if (showUnreadOnly) {
                filteredContacts = filteredContacts.filter(c => {
                    // Logic: unread_count > 0 (more accurate than just author check)
                    return c.unread_count && c.unread_count > 0;
                });
            }

            // 3. Stage Filter
            if (filterStages.length > 0) {
                filteredContacts = filteredContacts.filter(c =>
                    c.last_order_status && filterStages.includes(c.last_order_status)
                );
            }

            setContacts(filteredContacts);

            // Join rooms for all newly loaded contacts
            if (socket) {
                filteredContacts.forEach(c => {
                    socket.emit('join_contact', c.id);
                });
            }
        } catch (error) {
            console.error('Error fetching inbox contacts:', error);
        } finally {
            setIsLoadingContacts(false);
        }
    };

    const fetchMessages = async (contactId: number, loadMore = false) => {
        try {
            if (!loadMore) {
                setIsLoadingMessages(true);
                isInitialLoadRef.current = true; // Mark as initial load
            } else {
                setLoadingMore(true);
                isInitialLoadRef.current = false; // Not initial load
                // Save current scroll height before loading
                if (messagesContainerRef.current) {
                    previousScrollHeightRef.current = messagesContainerRef.current.scrollHeight;
                }
            }

            const limit = 50;
            const offset = loadMore ? messages.length : 0;
            const data = await contactMessagesAPI.getByContactId(contactId, { limit, offset });

            if (selectedContactRef.current === contactId) {
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
            }
        } catch (error: any) {
            console.error('Error fetching messages:', error);
            if (error.response) {
                console.error('Server Error Details:', error.response.data);
                antMessage.error(`Ошибка загрузки: ${JSON.stringify(error.response.data)}`);
            }
        } finally {
            if (selectedContactRef.current === contactId) {
                setIsLoadingMessages(false);
                setLoadingMore(false);
            }
        }
    };

    const selectContact = async (contact: ExtendedInboxContact) => {
        // Prevent double selecting
        if (selectedContactRef.current === contact.id && selectedContact) return;

        selectedContactRef.current = contact.id;
        setSelectedContact(contact);

        // Only update search params if they actually changed
        if (searchParams.get('contactId') !== String(contact.id)) {
            setSearchParams({ contactId: String(contact.id) }, { replace: true });
        }

        // Clear state immediately to avoid showing old data
        setActiveOrder(null);
        setMessages([]);
        setTotalMessages(0);

        fetchMessages(contact.id);

        // Загружаем активную заявку контакта
        try {
            const { orders } = await ordersAPI.getAll({ contact_id: contact.id, limit: 10 });
            const activeOrd = orders.find(o =>
                !['completed', 'scammer', 'client_rejected', 'lost'].includes(o.status)
            ) || orders[0];

            if (selectedContactRef.current === contact.id) {
                setActiveOrder(activeOrd || null);
            }
        } catch (error) {
            console.error('Error fetching contact orders:', error);
            if (selectedContactRef.current === contact.id) {
                setActiveOrder(null);
            }
        }

        // Mark client messages as read (GLOBAL for contact)
        if (contact.unread_count && contact.unread_count > 0) {
            try {
                await contactsAPI.markMessagesAsRead(contact.id);
                // Update local state
                setContacts(prev => {
                    if (showUnreadOnly) {
                        // If we are in "Unread Only" mode, remove the read contact
                        return prev.filter(c => c.id !== contact.id);
                    }
                    return prev.map(c =>
                        c.id === contact.id ? { ...c, unread_count: 0 } : c
                    );
                });
            } catch (error) {
                console.error('Error marking messages as read:', error);
            }
        }
    };



    const handleAddReaction = async (msg: Message, emoji: string) => {
        try {
            await messagesAPI.addReaction(msg.id, emoji); // Use shared API method
            // Real-time update will come via socket through useOrderChat hook
        } catch (error) {
            console.error('Error adding reaction:', error);
            antMessage.error('Не удалось добавить реакцию');
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!activeOrder?.id) return;
        await hookSendMessage(text, 'client');
        scrollToBottom();
    };

    const handleSendVoice = async (voice: Blob, duration: number) => {
        if (!activeOrder?.id) return;
        await hookSendMessage('', 'client', undefined, voice, duration);
        scrollToBottom();
    };

    const handleSendFile = async (file: File, caption?: string) => {
        if (!activeOrder?.id) return;
        await hookSendMessage(caption || '', 'client', file);
        scrollToBottom();
    };

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md; // Tablet (768px) is not mobile in this context, but we handle responsive width

    // Legacy generic isMobile variable mapping if needed, or just use !screens.md directly
    // const [isMobile, setIsMobile] = useState(window.innerWidth < 768); 
    // replacing the above with derived value

    const scrollToBottom = (instant = false) => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth' });
        }, 100);
    };

    // Auto-scroll to bottom ONLY on initial load or new messages (not when loading old)
    useEffect(() => {
        if (messages.length > 0 && !isLoadingMessages && !loadingMore && isInitialLoadRef.current) {
            scrollToBottom(true);
            isInitialLoadRef.current = false; // Reset after first scroll
        }
    }, [messages.length, isLoadingMessages, loadingMore]);

    // Infinite scroll: load more when scrolling near top
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        if (container.scrollTop < 100 && hasMore && !loadingMore && !isLoadingMessages && selectedContact) {
            fetchMessages(selectedContact.id, true);
        }
    };

    const showList = !isMobile || (isMobile && !selectedContact);
    const showChat = !isMobile || (isMobile && selectedContact);

    return (
        <Layout style={{ height: 'calc(100vh - 64px)', background: isMobile ? '#f5f5f5' : '#fff', border: isMobile ? 'none' : '1px solid #f0f0f0', borderRadius: isMobile ? 0 : 8, overflow: 'hidden' }}>
            {showList && (
                <Sider
                    width={isMobile ? '100%' : screens.xl ? 350 : 280}
                    theme="light"
                    style={{ borderRight: isMobile ? 'none' : '1px solid #f0f0f0', backgroundColor: isMobile ? 'transparent' : '#fff' }}
                >
                    <div style={{ padding: 16, borderBottom: isMobile ? 'none' : '1px solid #f0f0f0', background: isMobile ? '#f5f5f5' : '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Title level={4} style={{ margin: 0 }}>Диалоги</Title>
                            <Button
                                type={showUnreadOnly ? 'primary' : 'default'}
                                size="small"
                                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                            >
                                {showUnreadOnly ? 'Все' : 'Непрочитанные'}
                            </Button>
                            {/* NEW: Global Mark All Read Button */}
                            <Button
                                type="text"
                                size="small"
                                title="Пометить все как прочитанные"
                                onClick={async () => {
                                    if (window.confirm('Вы уверены, что хотите отметить ВСЕ сообщения как прочитанные?')) {
                                        try {
                                            await orderMessagesAPI.markAllRead();
                                            antMessage.success('Все сообщения отмечены как прочитанные');
                                            fetchContacts();
                                        } catch (e: any) {
                                            console.error(e);
                                            antMessage.error('Ошибка выполнения');
                                        }
                                    }
                                }}
                                icon={<span style={{ fontSize: 16 }}>✅</span>}
                            />
                        </div>

                        <Input
                            placeholder="Поиск..."
                            prefix={<SearchOutlined />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onPressEnter={fetchContacts}
                            style={{ marginBottom: 8, borderRadius: 8 }}
                        />

                        {showUnreadOnly && (
                            <div style={{ paddingBottom: 8 }}>
                                <select
                                    style={{ width: '100%', padding: 4, borderRadius: 4, borderColor: '#d9d9d9' }}
                                    multiple={false}
                                    value={filterStages[0] || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFilterStages(val ? [val] : []);
                                    }}
                                >
                                    <option value="">Все этапы</option>
                                    {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                                        <option key={key} value={key}>{val.icon} {val.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                    <div style={{ height: 'calc(100% - 140px)', overflowY: 'auto', padding: isMobile ? '0 12px' : 0, position: 'relative' }}>
                        {isLoadingContacts && contacts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                        ) : contacts.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: 40,
                                color: '#8c8c8c'
                            }}>
                                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>💬</div>
                                <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 500, color: '#262626' }}>
                                    Диалогов не найдено
                                </div>
                                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                                    {showUnreadOnly || filterStages.length > 0
                                        ? 'Попробуйте изменить фильтры или показать все диалоги'
                                        : 'Здесь будут отображаться диалоги с клиентами'}
                                </div>
                            </div>
                        ) : (
                            <List
                                itemLayout="horizontal"
                                dataSource={contacts}
                                renderItem={(contact) => {
                                    const isClientLast = contact.last_message && isClientMessage(contact.last_message.author_type);
                                    const isSelected = selectedContact?.id === contact.id;

                                    return (
                                        <List.Item
                                            className={`contact-item ${isSelected ? 'active' : ''}`}
                                            onClick={() => selectContact(contact)}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '12px 16px',
                                                background: isSelected
                                                    ? '#bae7ff'
                                                    : isMobile
                                                        ? '#fff' // White card on mobile
                                                        : isClientLast
                                                            ? '#e6f7ff'
                                                            : 'transparent',
                                                borderBottom: isMobile ? 'none' : '1px solid #f0f0f0',
                                                transition: 'all 0.3s',
                                                // Mobile Card Styles
                                                marginBottom: isMobile ? 8 : 0,
                                                borderRadius: isMobile ? 12 : 0,
                                                boxShadow: isMobile ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                                            }}
                                        >
                                            <List.Item.Meta
                                                avatar={
                                                    <Avatar size={48} icon={<UserOutlined />} src={contact.avatar_url} />
                                                }
                                                title={
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                        <Text strong style={{ flex: 1, minWidth: 0, marginRight: 8 }} ellipsis>{contact.name}</Text>
                                                        {contact.unread_count && contact.unread_count > 0 ? (
                                                            <div style={{
                                                                backgroundColor: '#ff4d4f',
                                                                color: '#fff',
                                                                borderRadius: '10px',
                                                                minWidth: 20,
                                                                height: 20,
                                                                padding: '0 6px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '11px',
                                                                fontWeight: 'bold',
                                                                marginRight: 8,
                                                                flexShrink: 0
                                                            }}>
                                                                {contact.unread_count}
                                                            </div>
                                                        ) : null}
                                                        {contact.last_active && (
                                                            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                                                                {formatTime(contact.last_active)}
                                                            </Text>
                                                        )}
                                                    </div>
                                                }
                                                description={
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Text type="secondary" style={{ flex: 1, minWidth: 0 }} ellipsis>
                                                                {contact.last_message?.content || 'Нет сообщений'}
                                                            </Text>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                            {contact.last_order_status && ORDER_STATUSES[contact.last_order_status as keyof typeof ORDER_STATUSES] && (
                                                                <Tag color={ORDER_STATUSES[contact.last_order_status as keyof typeof ORDER_STATUSES].color || 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 4px', flexShrink: 0 }}>
                                                                    {ORDER_STATUSES[contact.last_order_status as keyof typeof ORDER_STATUSES].label}
                                                                </Tag>
                                                            )}
                                                            {contact.responsible_person && (
                                                                <Text type="secondary" style={{ fontSize: 11 }} ellipsis>
                                                                    <UserOutlined style={{ marginRight: 4 }} />
                                                                    {contact.responsible_person}
                                                                </Text>
                                                            )}
                                                        </div>
                                                    </div>
                                                }
                                            />
                                        </List.Item>
                                    );
                                }}
                            />
                        )}
                    </div>
                </Sider>
            )}

            {showChat && (
                <Content style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    {selectedContact ? (
                        <>
                            {/* Header */}
                            <div style={{
                                padding: '16px 24px',
                                borderBottom: '1px solid #f0f0f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: '#fff',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                zIndex: 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {isMobile && (
                                        <Button
                                            icon={<ArrowLeftOutlined />}
                                            onClick={() => setSelectedContact(null)}
                                            type="text"
                                        />
                                    )}
                                    <Avatar size={40} style={{ backgroundColor: '#87d068' }}>{selectedContact.name[0]}</Avatar>
                                    <div>
                                        <Title level={5} style={{ margin: 0 }}>{selectedContact.name}</Title>
                                        <Space size="small">
                                            {selectedContact.phone && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    {selectedContact.phone}
                                                </Text>
                                            )}
                                            <Text type="secondary" style={{ fontSize: 10, color: '#d9d9d9' }}>
                                                ID: {selectedContact.id} {selectedContact.telegram_user_id ? `| TG: ${selectedContact.telegram_user_id}` : '| No TG ID'}
                                            </Text>
                                        </Space>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {(activeOrder || selectedContact.latest_order_id) && (
                                        <Space>
                                            <Button
                                                size="small"
                                                onClick={async () => {
                                                    const orderId = activeOrder?.id || selectedContact.latest_order_id;
                                                    // Mark CONTACT as read to catch ghost orders
                                                    if (selectedContact.id) {
                                                        try {
                                                            await contactsAPI.markMessagesAsRead(selectedContact.id);
                                                            antMessage.success('Все сообщения помечены прочитанными');
                                                            // Update local state is handled via sockets or manual refresh
                                                            setContacts(prev => {
                                                                if (showUnreadOnly) {
                                                                    return prev.filter(c => c.id !== selectedContact.id);
                                                                }
                                                                return prev.map(c =>
                                                                    c.id === selectedContact.id ? { ...c, unread_count: 0 } : c
                                                                );
                                                            });
                                                        } catch (e) {
                                                            antMessage.error('Ошибка при отметке прочитанным');
                                                        }
                                                    }
                                                }}
                                            >
                                                Прочитано
                                            </Button>
                                            <Link to={`/order/${activeOrder?.main_id || activeOrder?.id || selectedContact.latest_order_id}`}>
                                                <Button type="link" size="small">{isMobile ? 'Сделка' : 'Открыть сделку'}</Button>
                                            </Link>
                                        </Space>
                                    )}
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div
                                ref={messagesContainerRef}
                                onScroll={handleScroll}
                                style={{
                                    flex: 1,
                                    padding: isMobile ? '12px' : '24px',
                                    overflowY: 'auto',
                                    background: '#f5f5f5',
                                    backgroundImage: 'url("https://gw.alipayobjects.com/zos/rmsportal/FfdJeJRQWjEeGTpqgBKj.png")', // Subtle pattern
                                    backgroundBlendMode: 'overlay',
                                }}>
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
                                            <Empty description="История сообщений пуста" style={{ marginTop: 60 }} />
                                        ) : (
                                            (() => {
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
                                                        <div style={{ textAlign: 'center', margin: '24px 0 16px', opacity: 0.5, fontSize: 12 }}>
                                                            <span style={{ background: '#e0e0e0', padding: '4px 12px', borderRadius: 12 }}>{group.date}</span>
                                                        </div>
                                                        {group.msgs.map(msg => {
                                                            const isOwn = !isClientMessage(msg.author_type);
                                                            return (
                                                                <UnifiedMessageBubble
                                                                    key={msg.id}
                                                                    msg={msg}
                                                                    isOwn={isOwn}
                                                                    onAddReaction={handleAddReaction}
                                                                // Reply logic can be added here if we implement onReply/replyTo state
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                ));
                                            })()
                                        )}
                                    </>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            <ChatInput
                                onSendText={handleSendMessage}
                                onSendVoice={handleSendVoice}
                                onSendFile={handleSendFile}
                                sending={sending}
                            />
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                            <Empty description={isMobile ? "Выберите диалог" : "Выберите диалог из списка слева"} />
                        </div>
                    )
                    }
                </Content >
            )
            }
        </Layout >
    );
};

export default InboxPage;
