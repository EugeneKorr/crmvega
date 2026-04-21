import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import {
  Typography,

  Space,
  Button,
  Input,
  Select,
  Tag,
  Modal,
  Form,
  message,
  Divider,
  // Empty,
  // Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  // DollarOutlined,
  // CalendarOutlined,
  // EuroOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  UnorderedListOutlined,
  AppstoreOutlined,
  FilterOutlined,
  ReloadOutlined,
  LayoutOutlined,
} from '@ant-design/icons';
import { Table, Radio } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DndContext, DragOverlay, closestCorners, pointerWithin, KeyboardSensor, PointerSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Order, ORDER_STATUSES, Contact, OrderStatus, Tag as TagData, Manager } from '../types';
import { ordersAPI, contactsAPI, tagsAPI, managersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useOrders } from '../hooks/useOrders';
import KanbanOrderCard from '../components/KanbanOrderCard';
import MobileOrderList from '../components/MobileOrderList';
import OrderFilters from '../components/OrderFilters';
import { Badge } from 'antd';

const { Title } = Typography;
const { Option } = Select;



// Цвета для верхней полоски колонки
const COLUMN_COLORS: Record<string, string> = {
  unsorted: '#8c8c8c',
  accepted_anna: '#13c2c2',
  accepted_kostya: '#13c2c2',
  accepted_stas: '#13c2c2',
  accepted_lucy: '#13c2c2',
  in_progress: '#1890ff',
  survey: '#722ed1',
  transferred_nikita: '#fa8c16',
  transferred_val: '#fa8c16',
  transferred_ben: '#fa8c16',
  transferred_fin: '#fa8c16',
  partially_completed: '#a0d911',
  postponed: '#fadb14',
  client_rejected: '#f5222d',
  scammer: '#eb2f96',
  moderation: '#2f54eb',
  completed: '#52c41a',
};

// Old OrderCard and OrderCardProps Removed


interface KanbanColumnProps {
  status: OrderStatus;
  orders: Order[];
  onOrderClick: (order: Order) => void;
  onAddOrder: () => void;
  onStatusChange: (orderId: number, newStatus: OrderStatus) => void;
  onEditContact: (contact: Contact) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, orders, onOrderClick, onAddOrder, onStatusChange, onEditContact }) => {
  const statusInfo = ORDER_STATUSES[status];
  const orderIds = orders.map(d => d.id);
  const columnColor = COLUMN_COLORS[status] || '#8c8c8c';

  // Pagination state
  const [visibleCount, setVisibleCount] = useState(50);
  const hasMore = orders.length > visibleCount;
  const visibleOrders = orders.slice(0, visibleCount);

  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'column', status },
  });

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return orders.reduce((sum, order) => {
      let amount = order.amount || 0;
      if (order.currency === 'RUB') amount = amount / 100;
      if (order.currency === 'USD') amount = amount * 0.92;
      return sum + amount;
    }, 0);
  }, [orders]);

  return (
    <div className="kanban-column">
      {/* Column Header */}
      <div style={{
        background: '#fff',
        borderRadius: '8px 8px 0 0',
        borderTop: `3px solid ${columnColor}`,
        padding: '12px 16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{statusInfo?.label || status}</span>
        </div>
        <div style={{
          fontSize: 12,
          color: '#8c8c8c',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>{orders.length} заявок</span>
          <span>•</span>
          <span>€{Math.round(totalAmount).toLocaleString('ru-RU')}</span>
        </div>
      </div>

      {/* Cards Area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          background: isOver ? '#f0f9ff' : '#f5f7fa',
          padding: '8px',
          borderRadius: '0 0 8px 8px',
          transition: 'background 0.2s',
          minHeight: '300px', // Increased for better drop zone
          position: 'relative',
        }}
      >
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          {orders.length === 0 ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                color: '#bfbfbf',
                fontSize: 13,
                minHeight: '200px', // Ensure droppable area exists
              }}
            >
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={onAddOrder}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  height: 40,
                  borderColor: 'rgba(0,0,0,0.1)'
                }}
              >
                Быстрое добавление
              </Button>
            </div>
          ) : (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              {visibleOrders.map((order) => (
                <KanbanOrderCard
                  key={order.id}
                  order={order}
                  onOrderClick={onOrderClick}
                  onStatusChange={onStatusChange}
                  onEditContact={onEditContact}
                />
              ))}

              {hasMore && (
                <Button
                  type="dashed"
                  onClick={() => setVisibleCount(prev => prev + 50)}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    marginBottom: 8,
                    borderRadius: 6,
                  }}
                >
                  Показать ещё {Math.min(50, orders.length - visibleCount)} ({orders.length - visibleCount} скрыто)
                </Button>
              )}

              <Button
                type="text"
                icon={<PlusOutlined />}
                onClick={onAddOrder}
                style={{
                  width: '100%',
                  marginTop: 8,
                  color: '#bfbfbf',
                }}
              >
                Добавить
              </Button>
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
};

const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { manager } = useAuth();
  // const { socket } = useSocket(); // Handled in useOrders

  // Filters state (lifted up for useOrders)
  const [filters, setFilters] = useState<any>(() => {
    try {
      const savedFilters = localStorage.getItem('crm_order_filters');
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters);
        // Convert dates to string (API format) if needed, though they are stored as strings usually in LS or strings in JSON
        // We just parse and return. API expects strings for dates.
        return parsed;
      }
    } catch (e) { console.error(e); }
    return {};
  });

  const [isFiltersDrawerVisible, setIsFiltersDrawerVisible] = useState(false);

  // --- Column Visibility Optimization ---
  const DEFAULT_VISIBLE_STATUSES = Object.keys(ORDER_STATUSES).filter(
    key => !['completed', 'duplicate'].includes(key)
  ) as OrderStatus[];

  const [visibleStatuses, setVisibleStatuses] = useState<OrderStatus[]>(() => {
    try {
      const saved = localStorage.getItem('crm_visible_statuses');
      return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_STATUSES;
    } catch {
      return DEFAULT_VISIBLE_STATUSES;
    }
  });

  useEffect(() => {
    localStorage.setItem('crm_visible_statuses', JSON.stringify(visibleStatuses));
  }, [visibleStatuses]);
  // --------------------------------------

  // Combine filters with URL params (like tags)
  const activeFilters = useMemo(() => {
    const tagId = searchParams.get('tag');
    return {
      ...filters,
      tag_id: tagId ? parseInt(tagId) : undefined
    };
  }, [filters, searchParams]);

  // USE ORDERS HOOK
  const { orders, setOrders, loading, fetchOrders: refreshOrders } = useOrders({
    filters: activeFilters,
    visibleStatuses
  });

  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTags, setAllTags] = useState<TagData[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  // const [loading, setLoading] = useState(false); // Handled by hook
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [createStatus, setCreateStatus] = useState<OrderStatus>('unsorted');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [modal, contextHolder] = Modal.useModal();
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Save filters to localStorage whenever they change
  useEffect(() => {
    try {
      if (Object.keys(filters).length > 0) {
        localStorage.setItem('crm_order_filters', JSON.stringify(filters));
      } else {
        localStorage.removeItem('crm_order_filters');
      }
    } catch (e) {
      console.error('Error saving filters:', e);
    }
  }, [filters]);

  const handleClearFilters = () => {
    setFilters({});
  };

  // Edit Contact state
  const [isEditContactModalVisible, setIsEditContactModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editContactForm] = Form.useForm();

  // Bulk Actions State
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isBulkStatusModalVisible, setIsBulkStatusModalVisible] = useState(false);
  const [bulkStatusForm] = Form.useForm();

  // Reset selection when changing view mode or search
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [viewMode, debouncedSearchText]);

  const handleBulkStatusChange = async (values: { status: OrderStatus }) => {
    try {
      const ids = selectedRowKeys.map(key => Number(key));
      const { updatedCount } = await ordersAPI.bulkUpdateStatus(ids, values.status);

      message.success(`Обновлено сделок: ${updatedCount}`);
      setIsBulkStatusModalVisible(false);
      setSelectedRowKeys([]); // Clear selection
      refreshOrders(); // Refresh data
    } catch (error: any) {
      console.error('Bulk update error:', error);
      message.error(error.response?.data?.error || 'Ошибка массового обновления');
    }
  };

  const handleBulkDelete = () => {
    modal.confirm({
      title: `Удалить ${selectedRowKeys.length} сделок?`,
      icon: <ExclamationCircleOutlined />,
      content: 'Вы уверены? Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      zIndex: 10000,
      onOk: async () => {
        try {
          const ids = selectedRowKeys.map(key => Number(key));
          const { count } = await ordersAPI.bulkDelete(ids);

          message.success(`Удалено сделок: ${count}`);
          setSelectedRowKeys([]); // Clear selection
          refreshOrders(); // Refresh data
        } catch (error: any) {
          console.error('Bulk delete error:', error);
          message.error(error.response?.data?.error || 'Ошибка удаления');
        }
      },
    });
  };

  const rowSelection = useMemo(() => ({
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  }), [selectedRowKeys]);

  const [activeMobileColumn, setActiveMobileColumn] = useState<OrderStatus>('unsorted');
  const kanbanRef = useRef<HTMLDivElement>(null);
  // Refs for each column to scroll to them accurately
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const contactId = searchParams.get('contact_id');
    if (contactId && !form.getFieldValue('contact_id')) {
      form.setFieldsValue({ contact_id: parseInt(contactId) });
      setIsCreateModalVisible(true);
    }
  }, [searchParams, form]);

  useEffect(() => {
    // refreshOrders(); // Hook handles initial fetch
    fetchContacts();
    fetchTags();
    fetchManagers();
    // Socket setup moved to separate effect (in hook)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const sortedStatusOptions = useMemo(() => Object.entries(ORDER_STATUSES)
    .sort(([, a], [, b]) => (a.order || 0) - (b.order || 0))
    .map(([key, value]) => ({
      value: key as OrderStatus,
      label: value.label,
      icon: value.icon,
      color: value.color,
    })), []);

  const fetchContacts = async () => {
    try {
      const { contacts: fetchedContacts } = await contactsAPI.getAll({ limit: 1000 });
      setContacts(fetchedContacts);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const fetchTags = async () => {
    try {
      const tags = await tagsAPI.getAll();
      setAllTags(tags);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchManagers = async () => {
    try {
      const fetchedManagers = await managersAPI.getAll();
      setManagers(fetchedManagers);
    } catch (error) {
      console.error('Error fetching managers:', error);
    }
  };


  // Фильтрация по поиску
  const filteredOrders = useMemo(() => {
    if (!debouncedSearchText) return orders;
    const search = debouncedSearchText.toLowerCase();
    return orders.filter(order =>
      (order.title || '').toLowerCase().includes(search) ||
      (order.contact?.name || '').toLowerCase().includes(search) ||
      (order.description || '').toLowerCase().includes(search)
    );
  }, [orders, debouncedSearchText]);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeOrder = orders.find(d => d.id === active.id);
    if (!activeOrder) return;

    const validStatuses = Object.keys(ORDER_STATUSES);

    // Определяем целевой статус: либо это ID колонки, либо ID карточки
    let newStatus: OrderStatus | null = null;

    const overData = over.data.current;

    // Convert to string for checking against status keys
    const overIdString = String(over.id);

    if (overData?.type === 'column' && validStatuses.includes(overData.status)) {
      newStatus = overData.status;
    } else if (validStatuses.includes(overIdString)) {
      // Брошено на колонку (fallback)
      newStatus = overIdString as OrderStatus;
    } else {
      // Брошено на другую карточку - найдем статус этой карточки
      // dnd-kit might return string or number, try to match loosely or convert
      const targetOrder = orders.find(d => String(d.id) === String(over.id));
      if (targetOrder) {
        newStatus = targetOrder.status;
      }
    }

    if (!newStatus || activeOrder.status === newStatus) return;

    const statusToUpdate = newStatus as OrderStatus;

    // Оптимистичное обновление
    setOrders(prev => prev.map(d =>
      d.id === activeOrder.id ? { ...d, status: statusToUpdate } : d
    ));

    try {
      await ordersAPI.update(activeOrder.id, { status: statusToUpdate });
      message.success('Статус обновлен');
    } catch (error) {
      setOrders(prev => prev.map(d =>
        d.id === activeOrder.id ? activeOrder : d
      ));
      message.error('Ошибка обновления');
    }
  };

  const handleOrderClick = useCallback((order: Order) => {
    navigate(`/order/${order.main_id || order.id}`);
  }, [navigate]);

  const handleStatusChange = useCallback(async (orderId: number, newStatus: OrderStatus) => {
    const orders = ordersRef.current;
    const order = orders.find(d => d.id === orderId);
    if (!order || order.status === newStatus) return;

    // Optimistic update
    setOrders(prev => prev.map(d =>
      d.id === orderId ? { ...d, status: newStatus } : d
    ));

    try {
      await ordersAPI.update(orderId, { status: newStatus });
      message.success('Статус обновлен');
    } catch (error) {
      // Rollback
      setOrders(prev => prev.map(d =>
        d.id === orderId ? order : d
      ));
      message.error('Ошибка обновления статуса');
    }
  }, []);

  const handleCreateOrder = async (values: any) => {
    try {
      await ordersAPI.create({ ...values, status: values.status || createStatus });
      message.success('Заявка создана');
      setIsCreateModalVisible(false);
      form.resetFields();
      refreshOrders();
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка создания заявки');
    }
  };

  const handleClearUnsorted = () => {
    // Debug log
    console.log('handleClearUnsorted called via useModal');

    modal.confirm({
      title: 'Очистить "Неразобранное"?',
      icon: <ExclamationCircleOutlined />,
      content: 'Вы уверены, что хотите удалить ВСЕ заявки из статуса "Неразобранное"? Это действие нельзя отменить.',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      zIndex: 10000,
      onOk: async () => {
        try {
          const result = await ordersAPI.clearUnsorted();
          message.success(`Удалено заявок: ${result.count}`);
          refreshOrders();
        } catch (error: any) {
          console.error('Error clearing unsorted:', error);
          message.error(error.response?.data?.error || 'Ошибка очистки');
        }
      },
    });
  };

  const openCreateModal = (status: OrderStatus) => {
    setCreateStatus(status);
    form.setFieldsValue({ status });
    setIsCreateModalVisible(true);
  };

  // Edit Contact Logic
  const handleEditContact = useCallback((contact: Contact) => {
    setEditingContact(contact);
    editContactForm.setFieldsValue({ name: contact.name });
    setIsEditContactModalVisible(true);
  }, [editContactForm]);

  const handleUpdateContactName = async (values: any) => {
    if (!editingContact) return;
    try {
      await contactsAPI.update(editingContact.id, { name: values.name });
      message.success('Имя контакта обновлено');
      setIsEditContactModalVisible(false);

      // Update local state to reflect change across all orders for this contact
      setOrders(prev => prev.map(order =>
        order.contact_id === editingContact.id
          ? { ...order, contact: { ...order.contact!, name: values.name } }
          : order
      ));

      // Also update contacts list just in case
      setContacts(prev => prev.map(c =>
        c.id === editingContact.id ? { ...c, name: values.name } : c
      ));

    } catch (error: any) {
      console.error('Error updating contact:', error);
      message.error(error.response?.data?.error || 'Ошибка обновления имени контакта');
    }
  };

  // Группируем заявки по статусам
  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, Order[]> = {};
    // Only sort/render visible statuses
    visibleStatuses.forEach(status => {
      grouped[status] = [];
    });

    // Add unsorted if missing (safety)
    if (!grouped['unsorted'] && visibleStatuses.includes('unsorted')) {
      grouped['unsorted'] = [];
    }

    filteredOrders.forEach(order => {
      const status = order.status || 'unsorted';
      if (grouped[status]) {
        grouped[status].push(order);
      } else {
        // Only push to unsorted if valid, otherwise ignore (or check if it should be displayed)
        if (grouped['unsorted']) grouped['unsorted'].push(order);
      }
    });
    return grouped;
  }, [filteredOrders, visibleStatuses]);



  const draggedOrder = orders.find(d => d.id === activeId);

  // Сортируем статусы по order
  const sortedStatuses = useMemo(() => {
    return Object.entries(ORDER_STATUSES)
      .filter(([key]) => visibleStatuses.includes(key as OrderStatus))
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      .map(([key]) => key as OrderStatus);
  }, [visibleStatuses]);

  const scrollToColumn = (status: OrderStatus) => {
    setActiveMobileColumn(status);
    const colElement = columnRefs.current[status];
    if (colElement) {
      // Scroll container to this element
      // We use scrollIntoView or manual calculation relative to container
      colElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  const onRowProp = useCallback((record: Order) => ({
    onClick: () => navigate(`/order/${record.main_id || record.id}`),
    style: { cursor: 'pointer' } as React.CSSProperties
  }), [navigate]);

  const tableColumns = useMemo(() => [
    {
      title: 'Название сделки',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Order) => (
        <div style={{ color: '#1890ff', fontWeight: 500 }}>
          {record.OrderName || text || `Заявка #${record.id}`}
        </div>
      )
    },
    {
      title: 'Основной контакт',
      key: 'contact',
      render: (_: any, record: Order) => record.contact?.name || 'Без контакта'
    },
    {
      title: 'Этап сделки',
      dataIndex: 'status',
      key: 'status',
      render: (status: OrderStatus, record: Order) => {
        return (
          <div onClick={e => e.stopPropagation()}>
            <Select
              size="small"
              value={status}
              onChange={(newVal) => handleStatusChange(record.id, newVal)}
              style={{ width: '100%', minWidth: 140 }}
              bordered={false}
              showArrow={false}
              dropdownMatchSelectWidth={false}
              labelRender={(props) => {
                const statusInfo = ORDER_STATUSES[props.value as OrderStatus];
                return (
                  <div style={{
                    backgroundColor: statusInfo?.color === 'default' ? '#f0f0f0' : `${statusInfo?.color}15`,
                    color: statusInfo?.color || '#595959',
                    border: `1px solid ${statusInfo?.color || '#d9d9d9'}`,
                    padding: '2px 8px',
                    borderRadius: 4,
                    display: 'inline-block',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                    width: '100%'
                  }}>
                    {statusInfo?.label || props.label}
                  </div>
                );
              }}
            >
              {sortedStatusOptions.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  <Space size={4}>
                    <span style={{ color: opt.color }}>●</span>
                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                  </Space>
                </Option>
              ))}
            </Select>
          </div>
        );
      }
    },
    {
      title: 'Бюджет',
      key: 'amount',
      render: (_: any, record: Order) => (
        <div>
          {record.amount > 0 ? (
            <span style={{ fontWeight: 600 }}>
              {record.amount.toLocaleString('ru-RU')} {record.currency}
            </span>
          ) : (
            <span style={{ color: '#bfbfbf' }}>—</span>
          )}
        </div>
      )
    },
    {
      title: 'Дата создания',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString('ru-RU', { timeZone: 'Europe/Madrid' })
    }
  ], [handleStatusChange, sortedStatusOptions]);

  return (
    <div style={{
      height: '100%', // Changed from 100vh to 100% to fit parent
      display: 'flex',
      flexDirection: 'column',
      background: '#f0f2f5',
      overflow: 'hidden',
      position: 'relative', // For absolute positioning of bulk bar if needed
    }}>
      {contextHolder}

      {/* Bulk Actions Bar (Sticky) */}
      {selectedRowKeys.length > 0 && viewMode === 'list' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: '#fff',
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          animation: 'slideDown 0.2s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              Выбрано: {selectedRowKeys.length}
            </span>
            <Button
              onClick={() => setSelectedRowKeys([])}
              type="text"
              size="small"
              style={{ color: '#8c8c8c' }}
            >
              Отмена
            </Button>
          </div>

          <Space>
            <Button
              icon={<SearchOutlined rotate={90} />} // Use similar icon to "Change status"
              onClick={() => setIsBulkStatusModalVisible(true)}
            >
              Изм. этап
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleBulkDelete}
            >
              Удалить
            </Button>
          </Space>
        </div>
      )}

      {/* Header */}

      {/* Header */}
      {/* Desktop Header */}
      <div className="mobile-hidden" style={{
        background: '#fff',
        padding: '16px 24px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', flex: '1 1 auto' }}>
          <Title level={4} style={{ margin: 0 }}>ЗАЯВКИ</Title>
          <Input
            placeholder="Поиск и фильтр"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%', maxWidth: 250, borderRadius: 8 }}
            allowClear
          />
          {/* Status Visibility Selector */}
          <Select
            mode="multiple"
            placeholder="Столбцы"
            value={visibleStatuses}
            onChange={setVisibleStatuses}
            style={{ minWidth: 200, maxWidth: 400 }}
            maxTagCount="responsive"
            allowClear
            variant="filled" // Or 'borderless' or standard
            // showArrow
            suffixIcon={<LayoutOutlined />}
            dropdownMatchSelectWidth={300}
            dropdownRender={(menu) => (
              <>
                <div style={{ padding: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    type="default"
                    onClick={() => setVisibleStatuses(DEFAULT_VISIBLE_STATUSES)}
                  >
                    По умолчанию
                  </Button>
                  <Button
                    size="small"
                    onClick={() => setVisibleStatuses(Object.keys(ORDER_STATUSES) as OrderStatus[])}
                  >
                    Все
                  </Button>
                  <Button
                    size="small"
                    danger
                    onClick={() => setVisibleStatuses([])}
                  >
                    Сброс
                  </Button>
                </div>
                <Divider style={{ margin: 0 }} />
                {menu}
              </>
            )}
          >
            {sortedStatusOptions.map(opt => (
              <Option key={opt.value} value={opt.value}>
                <Space>
                  <span style={{ color: opt.color && opt.color !== 'default' ? opt.color : '#d9d9d9' }}>●</span>
                  {opt.label}
                </Space>
              </Option>
            ))}
          </Select>
          <Radio.Group
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="kanban">
              <AppstoreOutlined />
            </Radio.Button>
            <Radio.Button value="list">
              <UnorderedListOutlined />
            </Radio.Button>
          </Radio.Group>
        </div>

        {searchParams.get('tag') && (
          <div style={{ display: 'flex', alignItems: 'center', margin: '0 16px' }}>
            <Tag
              closable
              onClose={() => {
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('tag');
                navigate({ search: newParams.toString() });
              }}
              color="blue"
              style={{ fontSize: 14, padding: '4px 10px' }}
            >
              Фильтр: {allTags.find(t => t.id === parseInt(searchParams.get('tag')!))?.name || 'Тег #' + searchParams.get('tag')}
            </Tag>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 auto' }}>
          <Badge count={Object.keys(filters).length} offset={[-5, 5]}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setIsFiltersDrawerVisible(true)}
              style={{ borderRadius: 8 }}
            >
              Фильтры
            </Button>
          </Badge>

          {Object.keys(filters).length > 0 && (
            <Button
              onClick={handleClearFilters}
              style={{ borderRadius: 8 }}
            >
              Сбросить фильтры
            </Button>
          )}

          <Button
            icon={<ReloadOutlined />}
            onClick={() => refreshOrders()}
            style={{ borderRadius: 8 }}
          >
            Обновить
          </Button>

          {manager?.role === 'admin' && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleClearUnsorted}
              style={{ borderRadius: 8 }}
            >
              Очистить "Неразобранное"
            </Button>
          )}

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal('unsorted')}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: 8,
            }}
          >
            НОВАЯ ЗАЯВКА
          </Button>
        </div>
      </div>

      {/* Mobile Header - Clean & Compact */}
      <div className="mobile-only" style={{
        background: 'transparent',
        padding: '12px 16px',
        borderBottom: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input
            placeholder="Поиск"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ flex: 1, borderRadius: 8, background: '#fff', border: 'none' }} // Changed input bg to white to stand out on gray
            allowClear
          />

          <Button
            icon={viewMode === 'kanban' ? <UnorderedListOutlined /> : <AppstoreOutlined />}
            onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
            style={{ borderRadius: 8, border: 'none', background: '#fff' }} // Button bg white
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal('unsorted')}
            style={{
              borderRadius: 8,
              background: '#1890ff',
              border: 'none',
              width: 40,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          />
        </div>
      </div>

      {/* Content */}
      {viewMode === 'kanban' ? (
        <>
          {/* Mobile Status Navigator - only for Kanban */}
          <div className="mobile-only" style={{ padding: '0 16px 16px', background: 'transparent' }}>
            {/* ... select content ... */}
            <Select
              value={activeMobileColumn}
              onChange={scrollToColumn}
              style={{ width: '100%' }}
              size="large"
              virtual={false}
              dropdownMatchSelectWidth={false}
              getPopupContainer={(trigger) => trigger.parentNode}
            >
              {sortedStatuses.map(status => (
                <Option key={status} value={status}>
                  <Space>
                    {ORDER_STATUSES[status].icon}
                    {ORDER_STATUSES[status].label}
                    <Badge
                      count={ordersByStatus[status]?.length || 0}
                      style={{ backgroundColor: '#f0f0f0', color: '#999', boxShadow: 'none' }}
                    />
                  </Space>
                </Option>
              ))}
            </Select>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {loading && orders.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                background: '#fafafa',
                borderRadius: 12
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    border: '3px solid #f0f0f0',
                    borderTop: '3px solid #1890ff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 16px'
                  }} />
                  <div style={{ color: '#8c8c8c', fontSize: 14 }}>Загрузка заявок...</div>
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '400px',
                background: '#fafafa',
                borderRadius: 12,
                flexDirection: 'column',
                gap: 16
              }}>
                <div style={{
                  fontSize: 48,
                  opacity: 0.15
                }}>📦</div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 500,
                  color: '#262626'
                }}>Заявок пока нет</div>
                <div style={{
                  fontSize: 14,
                  color: '#8c8c8c',
                  maxWidth: 320,
                  textAlign: 'center',
                  lineHeight: 1.6
                }}>
                  Создайте первую заявку, нажав кнопку "НОВАЯ ЗАЯВКА" выше
                </div>
              </div>
            ) : (
              <div
                ref={kanbanRef}
                className="kanban-scroll-view"
              >
                <div className="kanban-track">
                  {sortedStatuses.map((status) => (
                    <div
                      key={status}
                      ref={el => { columnRefs.current[status] = el; }}
                      className="kanban-column-wrapper"
                    >
                      <KanbanColumn
                        status={status}
                        orders={ordersByStatus[status] || []}
                        onOrderClick={handleOrderClick}
                        onAddOrder={() => openCreateModal(status)}
                        onStatusChange={handleStatusChange}
                        onEditContact={handleEditContact}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DragOverlay>
              {draggedOrder ? (
                <KanbanOrderCard
                  order={draggedOrder}
                  onOrderClick={() => { }}
                />
              ) : null}
            </DragOverlay>
          </DndContext>

        </>
      ) : (
        <>

          {/* Desktop Table - Hidden on Mobile */}
          <div className="mobile-hidden" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <Table
              rowSelection={rowSelection}
              dataSource={filteredOrders}
              rowKey="id"
              pagination={{
                defaultPageSize: 20,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100']
              }}
              onRow={onRowProp}
              columns={tableColumns}
            />
          </div>

          {/* Mobile List View */}
          <div className="mobile-only" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <MobileOrderList
              orders={filteredOrders}
              onOrderClick={(order) => navigate(`/order/${order.main_id || order.id}`)}
              loading={loading}
            />
          </div>
        </>

      )}

      {/* Create Modal */}
      <Modal
        title="Новая заявка"
        open={isCreateModalVisible}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={500}
        styles={{
          header: { borderRadius: '12px 12px 0 0' },
        }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateOrder}
          initialValues={{ currency: 'EUR', status: createStatus }}
        >
          <Form.Item name="title" label="Название заявки" rules={[{ required: true }]}>
            <Input placeholder="Название заявки" />
          </Form.Item>
          <Form.Item name="contact_id" label="Контакт">
            <Select
              placeholder="Выберите контакт"
              showSearch
              filterOption={(input, option) =>
                ((option?.['data-label'] as string) || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {contacts.map((contact) => (
                <Option
                  key={contact.id}
                  value={contact.id}
                  data-label={`${contact.name || ''} ${contact.phone || ''}`}
                >
                  {contact.name} {contact.phone ? `(${contact.phone})` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="amount" label="Сумма" style={{ flex: 1 }}>
              <Input type="number" placeholder="0" />
            </Form.Item>
            <Form.Item name="currency" label="Валюта" style={{ width: 120 }}>
              <Select>
                <Option value="EUR">€ EUR</Option>
                <Option value="USD">$ USD</Option>
                <Option value="RUB">₽ RUB</Option>
                <Option value="USDT">₮ USDT</Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="status" label="Этап">
            <Select>
              {sortedStatuses.map((status) => (
                <Option key={status} value={status}>
                  {ORDER_STATUSES[status].icon} {ORDER_STATUSES[status].label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Описание заявки" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Contact Modal */}
      <Modal
        title="Редактировать имя клиента"
        open={isEditContactModalVisible}
        onCancel={() => setIsEditContactModalVisible(false)}
        onOk={() => editContactForm.submit()}
        width={400}
      >
        <Form
          form={editContactForm}
          layout="vertical"
          onFinish={handleUpdateContactName}
        >
          <Form.Item
            name="name"
            label="Имя клиента"
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input placeholder="Имя клиента" autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Status Modal */}
      <Modal
        title={`Изменить этап для ${selectedRowKeys.length} заявок`}
        open={isBulkStatusModalVisible}
        onCancel={() => setIsBulkStatusModalVisible(false)}
        onOk={() => bulkStatusForm.submit()}
      >
        <Form
          form={bulkStatusForm}
          layout="vertical"
          onFinish={handleBulkStatusChange}
        >
          <Form.Item name="status" label="Новый этап" rules={[{ required: true, message: 'Выберите этап' }]}>
            <Select>
              {sortedStatuses.map((status) => (
                <Option key={status} value={status}>
                  {ORDER_STATUSES[status].icon} {ORDER_STATUSES[status].label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Filters Drawer */}
      <OrderFilters
        visible={isFiltersDrawerVisible}
        onClose={() => setIsFiltersDrawerVisible(false)}
        onApply={(newFilters) => setFilters(newFilters)}
        managers={managers}
        tags={allTags}
      />
    </div>
  );
};

export default OrdersPage;
