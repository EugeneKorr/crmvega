import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { contactsAPI, ordersAPI } from '../services/api';
import { InboxContact, Order } from '../types';
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
    const { socket } = useSocket();
    const [searchParams, setSearchParams] = useSearchParams();
    const [contacts, setContacts] = useState<ExtendedInboxContact[]>([]);
    const [selectedContact, setSelectedContact] = useState<ExtendedInboxContact | null>(null);
    const [activeOrder, setActiveOrder] = useState<Order | null>(null);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

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
        fetchContacts();
    }, [showUnreadOnly, filterStages, searchQuery]);

    useEffect(() => {
        if (!socket) return;
        const handleGlobalUpdate = () => {
            fetchContacts();
        };
        socket.on('new_message_global', handleGlobalUpdate);
        return () => {
            socket.off('new_message_global', handleGlobalUpdate);
        };
    }, [socket]);

    const fetchContacts = async () => {
        setIsLoadingContacts(true);
        try {
            const params: any = {};
            if (showUnreadOnly) params.unread = true;
            if (searchQuery) params.search = searchQuery;
            if (filterStages.length > 0) params.statuses = filterStages.join(',');

            const data = await contactsAPI.getSummary(params);
            setContacts(data);

            // If we have contactId in URL, select it
            const contactIdFromUrl = searchParams.get('contactId');
            if (contactIdFromUrl && !selectedContactRef.current) {
                const contact = data.find((c: any) => String(c.id) === contactIdFromUrl);
                if (contact) {
                    selectContact(contact);
                }
            }
        } catch (error) {
            console.error('Error fetching contacts:', error);
            antMessage.error('Ошибка загрузки контактов');
        } finally {
            setIsLoadingContacts(false);
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
        <Layout style={{ height: 'calc(100vh - 64px)', background: '#fff', overflow: 'hidden' }}>
            {(!isMobile || !selectedContact) && (
                <Sider
                    width={isMobile ? '100%' : 350}
                    theme="light"
                    style={{
                        borderRight: '1px solid #f0f0f0',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                    }}
                >
                    <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                            placeholder="Поиск контактов..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            allowClear
                        />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {isLoadingContacts ? (
                            <div style={{ textAlign: 'center', padding: '24px' }}><Spin /></div>
                        ) : (
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
                                                <Avatar icon={<UserOutlined />} src={contact.avatar_url} />
                                            }
                                            title={
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Text strong style={{ fontSize: 14 }}>{contact.name || 'Без имени'}</Text>
                                                    {contact.unread_count ? (
                                                        <div style={{
                                                            background: '#ff4d4f',
                                                            color: '#fff',
                                                            borderRadius: '10px',
                                                            padding: '0 6px',
                                                            fontSize: '11px',
                                                            minWidth: '20px',
                                                            textAlign: 'center'
                                                        }}>
                                                            {contact.unread_count}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            }
                                            description={
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                                    <Text type="secondary" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                                        {contact.last_message?.content || contact.phone || 'Нет сообщений'}
                                                    </Text>
                                                </div>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </div>
                </Sider>
            )}

            {(isMobile && selectedContact || !isMobile) && (
                <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
                    {selectedContact ? (
                        <>
                            <div style={{
                                padding: '12px 16px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderBottom: '1px solid #f0f0f0',
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
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5' }}>
                            <Empty description={isMobile ? "Выберите диалог" : "Выберите диалог из списка слева"} />
                        </div>
                    )}
                </Content>
            )}
        </Layout>
    );
};

export default InboxPage;
