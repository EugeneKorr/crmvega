import React, { useState, useEffect, useRef } from 'react';
import { contactsAPI, ordersAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import { InboxContact, Order } from '../types';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Layout,
    List,
    Input,
    Avatar,
    Badge,
    Button,
    Spin,
    Typography,
    Empty,
    Space,
    message as antMessage,
    Grid
} from 'antd';
import {
    SearchOutlined,
    UserOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import { UnifiedContactChat } from '../components/UnifiedContactChat';

const { Content, Sider } = Layout;
const { Text, Title } = Typography;


interface ExtendedInboxContact extends InboxContact {
    telegram_user_id?: number | string;
    last_message_at?: string;
    avatar_url?: string;
}

const InboxPage: React.FC = () => {
    const { manager } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const PAGE_SIZE = 50;

    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [filterStages, setFilterStages] = useState<string[]>([]);

    const selectedContactRef = useRef<number | null>(null);

    // Initial load & URL params
    useEffect(() => {
        const filterParam = searchParams.get('filter');
        if (filterParam === 'unread') {
            setShowUnreadOnly(true);
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
        setOffset(0);
        setHasMore(true);
        fetchContacts(false, 0);
    }, [showUnreadOnly, filterStages, searchQuery]);

    // Supabase Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel('global_inbox')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'messages' },
                () => {
                    fetchContacts(true); // Background refresh
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'contacts' },
                () => {
                    fetchContacts(true); // Background refresh
                }
            )
            .subscribe();

        // Presence implementation
        if (manager) {
            const presenceChannel = supabase.channel('online_users');
            presenceChannel
                .on('presence', { event: 'sync' }, () => {
                    // Could be used to show who is online
                    console.log('Presence sync:', presenceChannel.presenceState());
                })
                .subscribe(async (status: string) => {
                    if (status === 'SUBSCRIBED') {
                        await presenceChannel.track({
                            user_id: manager.id,
                            name: manager.name,
                            online_at: new Date().toISOString(),
                        });
                    }
                });

            return () => {
                supabase.removeChannel(channel);
                supabase.removeChannel(presenceChannel);
            };
        }

        return () => {
            supabase.removeChannel(channel);
        };
    }, [manager]);

    const fetchContacts = async (isBackground = false, currentOffset = 0, isLoadMore = false) => {
        if (!isBackground && !isLoadMore) setIsLoadingContacts(true);
        if (isLoadMore) setIsLoadingMore(true);

        try {
            const params: any = {
                limit: PAGE_SIZE,
                offset: currentOffset,
            };
            if (showUnreadOnly) params.unread = true;
            if (searchQuery) params.search = searchQuery;
            if (filterStages.length > 0) params.statuses = filterStages.join(',');

            const data = await contactsAPI.getSummary(params);

            if (isLoadMore) {
                setContacts(prev => [...prev, ...data]);
            } else if (!isBackground) {
                setContacts(data);
            } else {
                // Background refresh for existing list: 
                // We should only update if we are on the first page to avoid jumping
                if (currentOffset === 0) {
                    setContacts(prev => {
                        const newContacts = [...data];
                        // Preserve contacts not in the first page if needed, 
                        // but usually background refresh is only for the visible top.
                        return newContacts;
                    });
                }
            }

            setHasMore(data.length === PAGE_SIZE);

            // If we have contactId in URL and no selection, select it
            const contactIdFromUrl = searchParams.get('contactId');
            if (contactIdFromUrl && !selectedContactRef.current) {
                const contact = data.find((c: any) => String(c.id) === contactIdFromUrl);
                if (contact) {
                    selectContact(contact);
                }
            }
        } catch (error) {
            console.error('Error fetching contacts:', error);
            if (!isBackground) antMessage.error('Ошибка загрузки контактов');
        } finally {
            if (!isBackground) setIsLoadingContacts(false);
            if (isLoadMore) setIsLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (!hasMore || isLoadingMore || isLoadingContacts) return;
        const nextOffset = offset + PAGE_SIZE;
        setOffset(nextOffset);
        fetchContacts(false, nextOffset, true);
    };

    const handleSidebarScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 50) {
            handleLoadMore();
        }
    };

    const selectContact = async (contact: ExtendedInboxContact) => {
        if (selectedContactRef.current === contact.id && selectedContact) return;

        setSelectedContact(contact);
        selectedContactRef.current = contact.id;

        // Update search params
        if (searchParams.get('contactId') !== String(contact.id)) {
            setSearchParams({ contactId: String(contact.id) }, { replace: true });
        }

        // Fetch active order for this contact
        try {
            const { orders: contactOrders } = await ordersAPI.getAll({ contact_id: contact.id });
            const currentActive = contactOrders.find(o =>
                !['completed', 'scammer', 'client_rejected', 'lost', 'duplicate'].includes(o.status)
            ) || contactOrders[0] || null;

            setActiveOrder(currentActive);
        } catch (error) {
            console.error('Error selecting contact:', error);
            setActiveOrder(null);
        }

        // Mark as read
        if (contact.unread_count && contact.unread_count > 0) {
            try {
                await contactsAPI.markMessagesAsRead(contact.id);
                setContacts(prev => prev.map(c =>
                    c.id === contact.id ? { ...c, unread_count: 0 } : c
                ));
            } catch (error) { }
        }
    };

    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    return (
        <div style={{ display: 'flex', height: '100%', background: '#fff', overflow: 'hidden', width: '100%' }}>
            {(!isMobile || !selectedContact) && (
                <div
                    style={{
                        width: isMobile ? '100%' : 350,
                        borderRight: '1px solid #f0f0f0',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        flexShrink: 0
                    }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                            placeholder="Поиск контактов..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            allowClear
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button
                                type={!showUnreadOnly ? "primary" : "default"}
                                size="small"
                                shape="round"
                                onClick={() => {
                                    setShowUnreadOnly(false);
                                    setSearchParams(curr => { curr.delete('filter'); return curr; });
                                }}
                            >
                                Все
                            </Button>
                            <Button
                                type={showUnreadOnly ? "primary" : "default"}
                                size="small"
                                shape="round"
                                danger={showUnreadOnly}
                                onClick={() => {
                                    setShowUnreadOnly(true);
                                    setSearchParams(curr => { curr.set('filter', 'unread'); return curr; });
                                }}
                            >
                                Непрочитанные
                            </Button>
                        </div>
                    </div>
                    <div
                        style={{ flex: 1, overflowY: 'auto' }}
                        onScroll={handleSidebarScroll}
                    >
                        {isLoadingContacts && contacts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px' }}><Spin /></div>
                        ) : (
                            <>
                                <List
                                    dataSource={contacts}
                                    locale={{ emptyText: <Empty description="Контакты не найдены" /> }}
                                    renderItem={(contact) => (
                                        <List.Item
                                            onClick={() => selectContact(contact)}
                                            style={{
                                                padding: '12px 16px',
                                                cursor: 'pointer',
                                                background: selectedContact?.id === contact.id ? '#f0faff' : 'transparent',
                                                borderLeft: selectedContact?.id === contact.id ? '3px solid #1890ff' : '3px solid transparent',
                                                transition: 'all 0.3s'
                                            }}
                                            className="contact-item"
                                        >
                                            <List.Item.Meta
                                                avatar={
                                                    <Badge count={contact.unread_count || 0} size="small" offset={[0, 32]}>
                                                        <Avatar icon={<UserOutlined />} src={contact.avatar_url} />
                                                    </Badge>
                                                }
                                                title={
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text strong style={{
                                                            fontSize: 14,
                                                            color: contact.unread_count && contact.unread_count > 0 ? '#1890ff' : 'inherit'
                                                        }}>
                                                            {contact.name || 'Без имени'}
                                                        </Text>
                                                        {contact.last_message && contact.last_message['Created Date'] && (
                                                            <Text type="secondary" style={{ fontSize: 10 }}>
                                                                {new Date(contact.last_message['Created Date']).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </Text>
                                                        )}
                                                    </div>
                                                }
                                                description={
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                        <Text type="secondary" style={{
                                                            fontSize: 12,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            maxWidth: 220,
                                                            fontWeight: contact.unread_count && contact.unread_count > 0 ? 600 : 400,
                                                            color: contact.unread_count && contact.unread_count > 0 ? '#262626' : undefined
                                                        }}>
                                                            {contact.last_message?.content || contact.phone || 'Нет сообщений'}
                                                        </Text>
                                                        {contact.last_order_status && (
                                                            <div style={{ fontSize: 10, opacity: 0.7 }}>
                                                                #{contact.latest_order_id} • {contact.last_order_status}
                                                            </div>
                                                        )}
                                                    </div>
                                                }
                                            />
                                        </List.Item>
                                    )}
                                />
                                {isLoadingMore && <div style={{ textAlign: 'center', padding: '12px' }}><Spin size="small" /></div>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {(isMobile && selectedContact || !isMobile) && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    height: '100%',
                    minWidth: 0,
                    background: '#fff',
                    position: 'relative'
                }}>
                    {selectedContact ? (
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}>
                            <div style={{
                                padding: '12px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid #f0f0f0',
                                flexShrink: 0,
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
                                    <Avatar size={40} src={selectedContact.avatar_url} style={{ backgroundColor: '#87d068' }}>
                                        {selectedContact.name?.[0]}
                                    </Avatar>
                                    <div>
                                        <Title level={5} style={{ margin: 0 }}>{selectedContact.name}</Title>
                                        <Space size="small">
                                            {selectedContact.phone && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>{selectedContact.phone}</Text>
                                            )}
                                        </Space>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {(activeOrder || selectedContact.latest_order_id) && (
                                        <Link to={`/order/${activeOrder?.main_id || activeOrder?.id || selectedContact.latest_order_id}`}>
                                            <Button type="primary" ghost size="small">Сделка</Button>
                                        </Link>
                                    )}
                                </div>
                            </div>
                            <UnifiedContactChat
                                contactId={selectedContact.id}
                                activeOrder={activeOrder}
                                isMobile={isMobile}
                                style={{ flex: 1, minHeight: 0 }}
                            />
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                            <Empty description={isMobile ? "Выберите диалог" : "Выберите диалог из списка слева"} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default InboxPage;
