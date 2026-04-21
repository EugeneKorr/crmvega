import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Card,
  Space,
  Button,
  Tag,
  Avatar,
  List,
  Input,
  Form,
  Modal,
  Select,
  message,
  Empty,
  Row,
  Col,
  Tabs,
  Grid,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  DollarOutlined,
  // CalendarOutlined,
  EditOutlined,
  PlusOutlined,
  MessageOutlined,
  InfoCircleOutlined,
  TagOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Order, Note, ORDER_STATUSES, NOTE_PRIORITIES, InternalMessage } from '../types';
import { notesAPI, orderMessagesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useOrder } from '../hooks/useOrder';
import OrderChat from '../components/OrderChat';
import { OrderTags } from '../components/OrderTags';
import { usePresence, PresenceState } from '../context/PresenceContext';
const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const { onlineUsers, viewingOrder } = usePresence();
  // Notes state remains local for now
  const [notes, setNotes] = useState<Note[]>([]);
  const [history, setHistory] = useState<InternalMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // USE ORDER HOOK
  const { order, loading, updateOrder, updateStatus, refreshOrder } = useOrder(id);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [isTagsModalVisible, setIsTagsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [activeInfoTab, setActiveInfoTab] = useState<'info' | 'notes' | 'chat' | 'history'>('chat');

  // Reset tab to info if switching to desktop while in chat tab
  useEffect(() => {
    if (!isMobile && activeInfoTab === 'chat') {
      setActiveInfoTab('info');
    }
  }, [isMobile, activeInfoTab]);

  useEffect(() => {
    if (id) {
      fetchNotes();
      fetchHistory();
      viewingOrder(id);
      return () => viewingOrder(null);
    }
  }, [id]);

  const fetchHistory = async () => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const { messages } = await orderMessagesAPI.getInternalMessages(id as any, { limit: 100 });
      // Filter for system messages or messages that look like system ones
      setHistory(messages.filter((m: any) =>
        m.attachment_type === 'system' ||
        m.is_system === true ||
        ['✨', '🔄', '💰', '💱'].some(emoji => m.content.includes(emoji))
      ));
    } catch (error: any) {
      console.error('Error fetching history:', error);
      message.error(error.response?.data?.error || 'Ошибка загрузки истории');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Update form when order loads
  useEffect(() => {
    if (order) form.setFieldsValue(order);
  }, [order, form]);

  const fetchNotes = async () => {
    if (!id) return;
    try {
      const notesData = await notesAPI.getByOrderId(parseInt(id));
      setNotes(notesData);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleUpdateOrder = async (values: any) => {
    try {
      await updateOrder(values);
      setIsEditModalVisible(false);
    } catch (error) {
      // Error handled in hook (toast)
    }
  };

  const handleCreateNote = async (values: any) => {
    if (!id || !manager || !order) return;
    try {
      await notesAPI.create({
        order_id: id as any, // Notes use internal ID or uuid string depending on API expectation
        manager_id: manager.id,
        content: values.content,
        priority: values.priority || 'info',
      });
      message.success('Заметка создана');
      setIsNoteModalVisible(false);
      noteForm.resetFields();
      fetchNotes();
      fetchHistory(); // Creating a note is also kind of history
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания заметки');
    }
  };

  const handleStatusChange = async (newStatus: any) => {
    try {
      await updateStatus(newStatus);
      await fetchHistory(); // Refresh history on status change
    } catch (error: any) {
      // Error handled in hook or here
    }
  };

  const sortedStatusOptions = Object.entries(ORDER_STATUSES)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([key, value]) => ({
      value: key,
      label: value.label,
      icon: value.icon,
      color: value.color,
    }));

  // Render logic simplified to prevent full unmount on every load/update
  if (!order && !loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: 'white',
          padding: 40,
          borderRadius: 16,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🔍</div>
          <Title level={3} style={{ margin: '0 0 16px 0' }}>Заявка не найдена</Title>
          <Text style={{ display: 'block', marginBottom: 24, color: '#8c8c8c' }}>
            Заявка с ID {id} не существует или была удалена
          </Text>
          <Button
            type="primary"
            onClick={() => navigate('/orders')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
            }}
          >
            Вернуться к заявкам
          </Button>
        </div>
      </div>
    );
  }

  if (!order && loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{
          background: 'white',
          padding: 40,
          borderRadius: 16,
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
        }}>
          <Title level={4} style={{ margin: 0 }}>Загрузка заявки...</Title>
        </div>
      </div>
    );
  }

  if (!order) return null;

  const clean = (val: any) => {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    if (str === '' || str.toLowerCase() === 'null') return null;
    return str;
  };

  const FieldItem = ({ label, value, isCurrency = false }: { label: string, value: any, isCurrency?: boolean }) => {
    const cleaned = clean(value);
    if (!cleaned) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
        <Text type="secondary" style={{ width: '40%', paddingRight: 8 }}>{label}</Text>
        <div style={{ width: '60%', textAlign: 'right', wordBreak: 'break-word' }}>
          {isCurrency ? (
            <Text strong>{value}</Text>
          ) : (
            <Text>{cleaned}</Text>
          )}
        </div>
      </div>
    );
  };

  const OrderInfoTab = () => (
    <div style={{ padding: 16 }}>
      {/* Contact Card */}
      {order.contact && (
        <div style={{
          background: 'linear-gradient(135deg, #f6f8fc 0%, #eef2f7 100%)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}>
            <Text strong style={{ fontSize: 14 }}>Контакт</Text>
            <Button
              type="link"
              size="small"
              onClick={() => navigate(`/contact/${order.contact_id}`)}
            >
              Открыть
            </Button>
          </div>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar
                style={{ backgroundColor: '#667eea' }}
                icon={<UserOutlined />}
                size={32}
              />
              <Text strong>{order.contact.name}</Text>
            </div>
            {clean(order.contact.phone) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                <PhoneOutlined />
                <Text copyable>{order.contact.phone}</Text>
              </div>
            )}
            {clean(order.contact.email) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#595959' }}>
                <MailOutlined />
                <Text copyable>{order.contact.email}</Text>
              </div>
            )}
          </Space>
        </div>
      )}

      {/* Main Fields List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Статус</Text>
          <div style={{ marginTop: 4 }}>
            <Select
              value={order.status}
              onChange={handleStatusChange}
              size="middle"
              style={{ width: '100%' }}
              popupMatchSelectWidth={false}
            >
              {sortedStatusOptions.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  <Space>
                    <span>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
        </div>

        <FieldItem label="Менеджер" value={order.manager?.name} />
        <FieldItem label="Бюджет (Сумма)" value={order.amount ? `${order.amount.toLocaleString('ru-RU')} ${order.currency || ''}` : null} isCurrency />

        <FieldItem label="Клиент отдает" value={order.SumInput} />
        <FieldItem label="Отдает в валюте" value={order.CurrPair1} />
        <FieldItem label="Клиент получает" value={order.SumOutput} />
        <FieldItem label="Получает в валюте" value={order.CurrPair2} />

        <FieldItem label="Геолокация" value={order.CityEsp02 || order.Location1 || order.Location2} />
        <FieldItem label="Время встречи" value={order.DeliveryTime} />

        <FieldItem label="Отправляет из банка" value={order.BankRus01} />
        <FieldItem label="Город РФ где отдает" value={order.CityRus01} />
        <FieldItem label="Город Испания где отдает" value={order.CityEsp01} />
        <FieldItem label="Сеть с какой отправляет USDT" value={order.NetworkUSDT01} />

        <FieldItem label="Оплата сейчас или при встрече" value={order.PayNow} />
        <FieldItem label="Выдача на следующий день" value={order.NextDay} />

        <FieldItem label="Получает в банк" value={order.BankRus02 || order.BankEsp} />
        <FieldItem label="Город РФ где получает" value={order.CityRus02} />
        <FieldItem label="Город Испания где получает" value={order.CityEsp02} />
        <FieldItem label="Сеть на которую получает" value={order.NetworkUSDT02} />

        <FieldItem label="Адрес кошелька куда получает" value={order.ClientCryptoWallet} />
        <FieldItem label="Номер IBAN клиента" value={order.ClientIBAN || order.MessageIBAN} />
        <FieldItem label="Получатель Имя" value={order.PayeeName} />
        <FieldItem label="Назначение IBAN" value={null} />
        <FieldItem label="Номер карты или телефон" value={order.Card_NumberOrSBP} />

        <FieldItem label="Банкомат" value={order.ATM || order.ATM_Esp} />
        <FieldItem label="Адрес доставки" value={order.End_address || order.New_address} />
        <FieldItem label="Комментарий" value={order.description || order.Comment} />
        <FieldItem label="Источник" value={order.source} />
        <FieldItem label="Создано" value={new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })} />
        <FieldItem label="Закрыто" value={order.closed_date ? new Date(order.closed_date).toLocaleDateString('ru-RU', { timeZone: 'Europe/Madrid' }) : null} />
      </div>
    </div>
  );

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#f0f2f5',
    }}>
      {/* Header */}
      {isMobile ? (
        // Mobile Messenger-style Header
        // Mobile Messenger-style Header
        <div style={{
          background: '#fff',
          padding: '8px 12px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          zIndex: 100,
          position: 'sticky',
          top: 0,
          flexShrink: 0,
        }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined style={{ fontSize: 18, color: '#262626' }} />}
            onClick={() => navigate('/orders')}
            style={{ padding: 4, height: 32, width: 32 }}
          />

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Title level={5} style={{ margin: 0, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {order.title}
              </Title>
              {order.amount > 0 && (
                <div style={{
                  background: '#e6f7ff',
                  color: '#1890ff',
                  fontSize: 11,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 600
                }}>
                  {order.amount.toLocaleString('ru-RU')}
                </div>
              )}
            </div>

            {/* Mobile Status Selector */}
            <div style={{ marginTop: 2 }}>
              <Select
                value={order.status}
                onChange={handleStatusChange}
                size="small"
                bordered={false}
                dropdownMatchSelectWidth={false}
                style={{
                  fontSize: 12,
                  marginLeft: -8, // Align with text
                  width: '100%',
                  maxWidth: 200
                }}
                className="mobile-status-select"
              >
                {sortedStatusOptions.map((opt) => (
                  <Option key={opt.value} value={opt.value}>
                    <Space size={4}>
                      <span>{opt.icon}</span>
                      <span style={{
                        color: opt.color === 'red' ? '#ff4d4f' :
                          opt.color === 'green' ? '#52c41a' :
                            opt.color === 'blue' ? '#1890ff' :
                              opt.color === 'orange' ? '#fa8c16' :
                                'inherit'
                      }}>
                        {opt.label}
                      </span>
                    </Space>
                  </Option>
                ))}
              </Select>
            </div>
          </div>

          <Space size={4}>
            <Button
              type="text"
              icon={<TagOutlined style={{ fontSize: 18, color: '#262626' }} />}
              onClick={() => setIsTagsModalVisible(true)}
              style={{ padding: 4, height: 32, width: 32 }}
            />
            <Button
              type="text"
              icon={<EditOutlined style={{ fontSize: 18, color: '#262626' }} />}
              onClick={() => setIsEditModalVisible(true)}
              style={{ padding: 4, height: 32, width: 32 }}
            />
          </Space>
        </div>
      ) : (
        // Desktop Header
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '16px 24px',
          color: 'white',
          boxShadow: '0 2px 8px rgba(102, 126, 234, 0.4)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <Space size="middle" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/orders')}
                  className="back-button"
                >
                  Назад
                </Button>
              </div>

              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Title level={3} style={{ margin: 0, color: 'white' }}>
                    {order.title}
                  </Title>
                  <OrderTags
                    orderId={order.id}
                    initialTags={order.tags}
                    onTagsChange={(newTags) => refreshOrder()}
                  />
                </div>
                <Space style={{ marginTop: 4, flexWrap: 'wrap' }}>
                  <Select
                    value={order.status}
                    onChange={handleStatusChange}
                    style={{ width: 180, minWidth: 160 }}
                    className="status-select-header"
                    popupMatchSelectWidth={false}
                  >
                    {sortedStatusOptions.map((opt) => (
                      <Option key={opt.value} value={opt.value}>
                        <Space>
                          <span>{opt.icon}</span>
                          <span>{opt.label}</span>
                        </Space>
                      </Option>
                    ))}
                  </Select>
                  {order.amount > 0 && (
                    <span style={{
                      background: 'rgba(255,255,255,0.2)',
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>
                      <DollarOutlined /> {order.amount.toLocaleString('ru-RU')} {order.currency || 'RUB'}
                    </span>
                  )}
                </Space>
              </div>
            </Space>

            {/* Presence Indicator moved to the right */}
            {(() => {
              const otherViewers = Object.values(onlineUsers).filter(
                (u: PresenceState) => u.viewing_order_id === id && String(u.user_id) !== String(manager?.id)
              );

              if (otherViewers.length === 0) return null;

              const names = otherViewers.map(u => u.name.split(' ')[0]).join(', ');
              const isPlural = otherViewers.length > 1;

              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px 12px',
                  background: 'rgba(255, 255, 255, 0.12)',
                  borderRadius: '16px',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}>
                  <div className="pulse-dot" style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#52c41a',
                    marginRight: 8,
                  }} />
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: 400 }}>
                    <span style={{ opacity: 0.9 }}>{names}</span>
                    <span style={{ opacity: 0.7, marginLeft: 4 }}>
                      {isPlural ? 'просматривают' : 'просматривает'}
                    </span>
                  </Text>
                  <style>{`
                    .pulse-dot { animation: pulse 2s infinite; }
                    @keyframes pulse {
                      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(82, 196, 26, 0.7); }
                      70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(82, 196, 26, 0); }
                      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(82, 196, 26, 0); }
                    }
                  `}</style>
                </div>
              );
            })()}

            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => setIsEditModalVisible(true)}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: 'white'
              }}
            >
              Редактировать
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        flex: 1,
        padding: isMobile ? 0 : 16,
        gap: 16,
        overflow: 'hidden', // prevent double scrollbars
        minHeight: 0,
      }}>
        {/* Left Sidebar - Order Info */}
        <div style={{
          width: isMobile ? '100%' : screens.xl ? 450 : 320,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: isMobile ? 'visible' : 'auto',
          height: isMobile ? 'auto' : '100%',
        }}>
          {isMobile ? (
            <Tabs
              activeKey={activeInfoTab}
              onChange={(key) => setActiveInfoTab(key as 'info' | 'notes' | 'chat' | 'history')}
              type="card"
              items={[
                {
                  key: 'info',
                  label: <span><InfoCircleOutlined /> Инфо</span>,
                  children: (
                    <Card style={{ borderRadius: '0 0 12px 12px' }} bodyStyle={{ padding: 12 }}>
                      <OrderInfoTab />
                    </Card>
                  ),
                },
                {
                  key: 'notes',
                  label: <span><MessageOutlined /> Заметки ({notes.length})</span>,
                  children: (
                    <Card style={{ borderRadius: '0 0 12px 12px' }} bodyStyle={{ padding: 12 }}>
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => setIsNoteModalVisible(true)}
                        block
                        style={{ marginBottom: 16, borderRadius: 8 }}
                      >
                        Добавить заметку
                      </Button>
                      {notes.length === 0 ? (
                        <Empty description="Нет заметок" />
                      ) : (
                        <List
                          dataSource={notes}
                          renderItem={(note) => (
                            <div style={{
                              background: '#fafafa',
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 8,
                              borderLeft: `3px solid ${NOTE_PRIORITIES[note.priority]?.color === 'red' ? '#ff4d4f' :
                                NOTE_PRIORITIES[note.priority]?.color === 'orange' ? '#fa8c16' :
                                  NOTE_PRIORITIES[note.priority]?.color === 'blue' ? '#1890ff' : '#52c41a'}`,
                            }}>
                              <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                              }}>
                                <Tag color={NOTE_PRIORITIES[note.priority]?.color} style={{ margin: 0 }}>
                                  {NOTE_PRIORITIES[note.priority]?.icon} {NOTE_PRIORITIES[note.priority]?.label}
                                </Tag>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {new Date(note.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })}
                                </Text>
                              </div>
                              <Text style={{ fontSize: 13 }}>{note.content}</Text>
                              {note.manager && (
                                <div style={{ marginTop: 8 }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    — {note.manager.name}
                                  </Text>
                                </div>
                              )}
                            </div>
                          )}
                        />
                      )}
                    </Card>
                  )
                },
                {
                  key: 'history',
                  label: <span><HistoryOutlined /> История</span>,
                  children: (
                    <Card style={{ borderRadius: '0 0 12px 12px' }} bodyStyle={{ padding: 12 }}>
                      {loadingHistory ? (
                        <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                      ) : history.length === 0 ? (
                        <Empty description="История пуста" />
                      ) : (
                        <List
                          dataSource={history}
                          renderItem={(item: any) => (
                            <div style={{
                              padding: '8px 0',
                              borderBottom: '1px solid #f0f0f0',
                              fontSize: 13
                            }}>
                              <div style={{ marginBottom: 4 }}>{item.content}</div>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(item.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })}
                              </Text>
                            </div>
                          )}
                        />
                      )}
                    </Card>
                  )
                },
                {
                  key: 'chat',
                  label: <span><MessageOutlined /> Чат</span>,
                  children: (
                    <div style={{ height: 'calc(100vh - 120px)', background: '#fff' }}>
                      {order.contact_id || order.main_id || order.external_id ? (
                        <OrderChat
                          orderId={order.id}
                          mainId={order.main_id}
                          contactName={order.contact?.name}
                          isMobile={true}
                          order={order}
                        />
                      ) : (
                        <Empty description="Нет чата" />
                      )}
                    </div>
                  )
                }
              ]}
            />
          ) : (
            <Card
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 12,
              }}
              bodyStyle={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
              }}
            >
              <Tabs
                activeKey={activeInfoTab}
                onChange={(key) => setActiveInfoTab(key as 'info' | 'notes' | 'history')}
                style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                tabBarStyle={{ padding: '0 16px', margin: 0, position: 'sticky', top: 0, zIndex: 10, background: '#fff' }}
                items={[
                  {
                    key: 'info',
                    label: (
                      <span>
                        <InfoCircleOutlined /> Информация
                      </span>
                    ),
                    children: (
                      <div style={{ height: '100%' }}>
                        <OrderInfoTab />
                      </div>
                    ),
                  },
                  {
                    key: 'notes',
                    label: (
                      <span>
                        <MessageOutlined /> Заметки ({notes.length})
                      </span>
                    ),
                    children: (
                      <div style={{ padding: 16, flex: 1 }}>
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          onClick={() => setIsNoteModalVisible(true)}
                          block
                          style={{ marginBottom: 16, borderRadius: 8 }}
                        >
                          Добавить заметку
                        </Button>
                        {notes.length === 0 ? (
                          <Empty
                            description="Нет заметок"
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                          />
                        ) : (
                          <List
                            dataSource={notes}
                            renderItem={(note) => (
                              <div style={{
                                background: '#fafafa',
                                borderRadius: 8,
                                padding: 12,
                                marginBottom: 8,
                                borderLeft: `3px solid ${NOTE_PRIORITIES[note.priority]?.color === 'red' ? '#ff4d4f' :
                                  NOTE_PRIORITIES[note.priority]?.color === 'orange' ? '#fa8c16' :
                                    NOTE_PRIORITIES[note.priority]?.color === 'blue' ? '#1890ff' : '#52c41a'}`,
                              }}>
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 8,
                                }}>
                                  <Tag color={NOTE_PRIORITIES[note.priority]?.color} style={{ margin: 0 }}>
                                    {NOTE_PRIORITIES[note.priority]?.icon} {NOTE_PRIORITIES[note.priority]?.label}
                                  </Tag>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {new Date(note.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })}
                                  </Text>
                                </div>
                                <Text style={{ fontSize: 13 }}>{note.content}</Text>
                                {note.manager && (
                                  <div style={{ marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      — {note.manager.name}
                                    </Text>
                                  </div>
                                )}
                              </div>
                            )}
                          />
                        )}
                      </div>
                    ),
                  },
                  {
                    key: 'history',
                    label: (
                      <span>
                        <HistoryOutlined /> История
                      </span>
                    ),
                    children: (
                      <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
                        {loadingHistory ? (
                          <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                        ) : history.length === 0 ? (
                          <Empty description="История взаимодействий пуста" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                          <List
                            dataSource={history}
                            renderItem={(item: any) => (
                              <div style={{
                                padding: '12px',
                                background: '#f9f9f9',
                                borderRadius: 8,
                                marginBottom: 8,
                                borderLeft: '3px solid #d9d9d9',
                                fontSize: 13
                              }}>
                                <div style={{ marginBottom: 4 }}>{item.content}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {item.sender?.name || 'Система'}
                                  </Text>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {new Date(item.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })}
                                  </Text>
                                </div>
                              </div>
                            )}
                          />
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </div>

        {/* Right Side - Chat (Desktop Only) */}
        {!isMobile && (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflow: 'hidden',
          }}>
            {order.contact_id || order.main_id || order.external_id ? (
              <OrderChat
                orderId={order.id}
                mainId={order.main_id}
                contactName={order.contact?.name}
                order={order}
              />
            ) : (
              <Card style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
              }}>
                <Empty
                  description="У заявки нет связанного контакта или ID"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Edit Order Modal */}
      <Modal
        title="Редактировать заявку"
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
          body: { paddingTop: 24 },
        }}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateOrder}>
          <Form.Item name="title" label="Название заявки" rules={[{ required: true }]}>
            <Input placeholder="Название заявки" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amount" label="Сумма">
                <Input type="number" placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Валюта">
                <Select>
                  <Option value="RUB">₽ RUB</Option>
                  <Option value="USD">$ USD</Option>
                  <Option value="EUR">€ EUR</Option>
                  <Option value="USDT">₮ USDT</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="status" label="Статус">
            <Select>
              {Object.entries(ORDER_STATUSES).map(([key, info]) => (
                <Option key={key} value={key}>
                  {info.icon} {info.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="due_date" label="Крайний срок">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={4} placeholder="Описание заявки" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Note Modal */}
      <Modal
        title="Добавить заметку"
        open={isNoteModalVisible}
        onCancel={() => {
          setIsNoteModalVisible(false);
          noteForm.resetFields();
        }}
        onOk={() => noteForm.submit()}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
        }}
      >
        <Form form={noteForm} layout="vertical" onFinish={handleCreateNote}>
          <Form.Item name="content" label="Содержание" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Текст заметки" />
          </Form.Item>
          <Form.Item name="priority" label="Приоритет" initialValue="info">
            <Select>
              {Object.entries(NOTE_PRIORITIES).map(([key, info]) => (
                <Option key={key} value={key}>
                  {info.icon} {info.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Tags Modal */}
      <Modal
        title="Теги заявки"
        open={isTagsModalVisible}
        onCancel={() => setIsTagsModalVisible(false)}
        footer={null}
        width={400}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
          body: { padding: 16 },
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Нажмите на тег чтобы добавить или удалить его
          </Text>
        </div>
        <OrderTags
          orderId={order.id}
          initialTags={order.tags}
          onTagsChange={(newTags) => {
            refreshOrder();
            // Keep modal open for multiple selection
          }}
        />
        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <Button type="primary" onClick={() => setIsTagsModalVisible(false)}>
            Готово
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default OrderDetailPage;
