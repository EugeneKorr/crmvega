import React, { useState, useEffect, useRef } from 'react';
import {
  Typography,
  Card,
  Tabs,
  Space,
  Avatar,
  Button,
  Row,
  Col,
  Descriptions,
  Tag,
  List,
  Input,
  Form,
  Modal,
  Select,
  Upload,
  message,
  Grid
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { Contact, Order, Note, NOTE_PRIORITIES, ORDER_STATUSES } from '../types';
import { contactsAPI, ordersAPI, notesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useClientProfiles } from '../contexts/ClientProfileContext';
import ClientAvatar from '../components/ClientAvatar';
import { formatAnimalSubtitle } from '../utils/clientProfile';
import { UnifiedContactChat } from '../components/UnifiedContactChat';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const ContactDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { manager } = useAuth();
  const { getProfile } = useClientProfiles();
  const [contact, setContact] = useState<Contact | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [activeTab, setActiveTab] = useState('data');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [form] = Form.useForm();
  const [noteForm] = Form.useForm();

  useEffect(() => {
    if (id) {
      fetchContact();
      fetchOrders();
      fetchNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchContact = async () => {
    if (!id) return;
    try {
      setNotFound(false);
      const data = await contactsAPI.getById(id);
      setContact(data);
      form.setFieldsValue(data);
    } catch (error: any) {
      console.error('Error fetching contact:', error);
      if (error.response?.status === 404) {
        setNotFound(true);
      } else {
        message.error('Ошибка загрузки контакта');
      }
    }
  };

  const fetchOrders = async () => {
    if (!id) return;
    try {
      const { orders: fetchedOrders } = await ordersAPI.getAll({ contact_id: parseInt(id) });
      setOrders(fetchedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const fetchNotes = async () => {
    if (!id) return;
    try {
      const data = await notesAPI.getByContactId(parseInt(id));
      setNotes(data);
    } catch (error) {
      console.error('Error fetching notes:', error);
    }
  };

  const handleUpdateContact = async (values: any) => {
    if (!contact) return;
    try {
      await contactsAPI.update(contact.id, values);
      message.success('Контакт обновлен');
      setIsEditModalVisible(false);
      fetchContact();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка обновления контакта');
    }
  };

  const handleCreateNote = async (values: any) => {
    if (!id || !manager) return;
    try {
      await notesAPI.create({
        contact_id: parseInt(id),
        manager_id: manager.id,
        content: values.content,
        priority: values.priority || 'info',
      });
      message.success('Заметка создана');
      setIsNoteModalVisible(false);
      noteForm.resetFields();
      fetchNotes();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания заметки');
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await notesAPI.delete(noteId);
      message.success('Заметка удалена');
      fetchNotes();
    } catch (error: any) {
      message.error('Ошибка удаления заметки');
    }
  };

  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  if (notFound) {
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
          <Title level={3} style={{ margin: '0 0 16px 0' }}>Контакт не найден</Title>
          <Text style={{ display: 'block', marginBottom: 24, color: '#8c8c8c' }}>
            Контакт с ID {id} не существует или был удален
          </Text>
          <Button
            type="primary"
            onClick={() => navigate('/contacts')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
            }}
          >
            Вернуться к контактам
          </Button>
        </div>
      </div>
    );
  }

  if (!contact) {
    return <div>Загрузка...</div>;
  }




  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: isMobile ? '12px 16px' : '24px',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Space align="start">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/contacts')} shape="circle" />
            <Space size={16} style={{ marginLeft: 8 }}>
              <ClientAvatar profile={getProfile(contact.telegram_user_id)} size={isMobile ? 48 : 64} />
              <div>
                <Title level={isMobile ? 4 : 2} style={{ margin: 0 }}>{contact.name}</Title>
                {(() => {
                  const p = getProfile(contact.telegram_user_id);
                  return p ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatAnimalSubtitle(p)}</Text>
                  ) : (
                    <Text type="secondary">{contact.position || 'Клиент'}</Text>
                  );
                })()}
              </div>
            </Space>
          </Space>
          {!isMobile && (
            <Button icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)}>
              Редактировать
            </Button>
          )}
          {isMobile && (
            <Button type="text" icon={<EditOutlined />} onClick={() => setIsEditModalVisible(true)} />
          )}
        </div>

        {/* Quick Stats Summary */}
        <div style={{
          marginTop: 16,
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 4
        }}>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Баланс обменов</div>
            <div style={{ fontWeight: 600 }}>{(contact.TotalSumExchanges || contact.orders_total_amount || 0).toLocaleString('ru-RU')}</div>
          </div>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Заявок</div>
            <div style={{ fontWeight: 600 }}>{contact.orders_count || orders.length || 0}</div>
          </div>
          <div style={{ background: '#f9f9f9', padding: '8px 12px', borderRadius: 8, minWidth: 100 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Лояльность</div>
            <div style={{ fontWeight: 600 }}>{contact.Loyality ?? 0}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? 0 : 24 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ background: isMobile ? '#fff' : 'transparent' }}
          tabBarStyle={{
            padding: isMobile ? '0 16px' : 0,
            background: isMobile ? '#fff' : 'transparent',
            marginBottom: isMobile ? 0 : 16
          }}
          items={[
            {
              key: 'data',
              label: 'Инфо',
              children: (
                <div style={{ padding: 0, background: isMobile ? '#fff' : 'transparent' }}>
                  <Card bordered={false} style={{ borderRadius: isMobile ? 0 : 8, boxShadow: isMobile ? 'none' : undefined }}>
                    <Descriptions column={1} layout={isMobile ? 'vertical' : 'horizontal'}>
                      <Descriptions.Item label="Email">{contact.email || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Телефон">{contact.phone || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Дата создания">{new Date(contact.created_at).toLocaleDateString('ru-RU', { timeZone: 'Europe/Madrid' })}</Descriptions.Item>
                      <Descriptions.Item label="Комментарий">{contact.comment || '-'}</Descriptions.Item>
                    </Descriptions>
                  </Card>
                </div>
              ),
            },
            {
              key: 'messages',
              label: 'Чат',
              children: (
                <div style={{
                  height: isMobile ? 'calc(100vh - 280px)' : '600px',
                  background: '#fff',
                  margin: isMobile ? 0 : 0
                }}>
                  <UnifiedContactChat
                    contactId={parseInt(id!)}
                    activeOrder={orders.find(o =>
                      !['completed', 'scammer', 'client_rejected', 'lost'].includes(o.status)
                    ) || orders[0]}
                    isMobile={isMobile}
                  />
                </div>
              )
            },
            {
              key: 'orders',
              label: `Заявки (${orders.length})`,
              children: (
                <div style={{ padding: 0, paddingBottom: 80 }}>
                  <Button block type="dashed" icon={<PlusOutlined />} onClick={() => navigate(`/orders?contact_id=${id}`)} style={{ margin: 16, width: 'calc(100% - 32px)' }}>
                    Новая заявка
                  </Button>
                  <List
                    dataSource={orders}
                    renderItem={order => (
                      <Card size="small" style={{ marginBottom: 1, borderRadius: 0 }} onClick={() => navigate(`/order/${order.main_id || order.id}`)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ fontWeight: 600 }}>#{order.id} {order.title}</div>
                          <Tag>{ORDER_STATUSES[order.status]?.label}</Tag>
                        </div>
                        <div style={{ marginTop: 8, color: '#666' }}>
                          {order.amount?.toLocaleString()} {order.currency}
                        </div>
                      </Card>
                    )}
                  />
                </div>
              )
            },
            {
              key: 'notes',
              label: 'Заметки',
              children: (
                <div style={{ padding: 0 }}>
                  <Button block type="dashed" icon={<PlusOutlined />} onClick={() => setIsNoteModalVisible(true)} style={{ margin: 16, width: 'calc(100% - 32px)' }}>
                    Добавить заметку
                  </Button>
                  <List
                    dataSource={notes}
                    renderItem={note => {
                      const priorityInfo = NOTE_PRIORITIES[note.priority];
                      return (
                        <Card size="small" style={{ marginBottom: 1, borderRadius: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Space>
                              <span>{priorityInfo.icon}</span>
                              <span style={{ fontWeight: 500 }}>{priorityInfo.label}</span>
                            </Space>
                            {note.manager_id === manager?.id && (
                              <Button type="text" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDeleteNote(note.id)} />
                            )}
                          </div>
                          <div style={{ marginTop: 8 }}>{note.content}</div>
                          <div style={{ marginTop: 4, fontSize: 11, color: '#aaa' }}>
                            {note.manager?.name} • {new Date(note.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Madrid' })}
                          </div>
                        </Card>
                      );
                    }}
                  />
                </div>
              )
            }
          ]}
        />
      </div>

      <Modal
        title="Редактировать контакт"
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateContact}>
          <Form.Item label="Фото контакта">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Form.Item name="avatar_url" noStyle>
                <Input style={{ display: "none" }} />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, curr) => prev.avatar_url !== curr.avatar_url}>
                {({ getFieldValue }) => (
                  <Avatar
                    size={64}
                    src={getFieldValue('avatar_url')}
                    icon={<UserOutlined />}
                    style={{ flexShrink: 0 }}
                  />
                )}
              </Form.Item>
              <Upload
                accept="image/*"
                showUploadList={false}
                customRequest={async ({ file, onSuccess, onError }: any) => {
                  try {
                    const result = await contactsAPI.uploadFile(file);
                    form.setFieldsValue({ avatar_url: result.url });
                    onSuccess(result);
                    message.success('Фото загружено');
                  } catch (err) {
                    onError(err);
                    message.error('Ошибка загрузки фото');
                  }
                }}
              >
                <Button icon={<PlusOutlined />}>Изменить фото</Button>
              </Upload>
            </div>
          </Form.Item>

          <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label="Должность">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comment" label="Комментарий">
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Добавить заметку"
        open={isNoteModalVisible}
        onCancel={() => {
          setIsNoteModalVisible(false);
          noteForm.resetFields();
        }}
        onOk={() => noteForm.submit()}
      >
        <Form form={noteForm} layout="vertical" onFinish={handleCreateNote}>
          <Form.Item name="priority" label="Приоритет">
            <Select defaultValue="info">
              <Option value="urgent">🔴 Срочно</Option>
              <Option value="important">🟡 Важно</Option>
              <Option value="info">🟢 Информация</Option>
              <Option value="reminder">🔵 Напоминание</Option>
            </Select>
          </Form.Item>
          <Form.Item name="content" label="Текст заметки" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Введите текст заметки..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ContactDetailPage;
