import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { ordersAPI } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { Order, OrderStatus, ORDER_STATUSES } from '../types';

interface UseOrdersProps {
    filters: any;
    visibleStatuses: OrderStatus[];
}

export const useOrders = ({ filters, visibleStatuses }: UseOrdersProps) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const { socket } = useSocket();
    const ordersRef = useRef(orders);
    ordersRef.current = orders;

    const CACHE_KEY = 'crm_orders_cache';
    const CACHE_TTL = 60 * 1000; // 60 seconds

    const fetchOrders = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);

        try {
            // 1. Try Cache if default filters
            const isDefaultFilters = Object.keys(filters).length === 0;
            if (isDefaultFilters && !isBackground) {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    try {
                        const { data, timestamp, statuses } = JSON.parse(cached);
                        const age = Date.now() - timestamp;
                        const cachedStatusesStr = JSON.stringify(statuses?.sort());
                        const currentStatusesStr = JSON.stringify(visibleStatuses.slice().sort());

                        if (age < CACHE_TTL && cachedStatusesStr === currentStatusesStr) {
                            setOrders(data);
                            // If cache used, we still might want to fetch in background to refresh
                            // But let's return here to show data immediately
                            // We will trigger a background fetch after this
                        }
                    } catch (e) {
                        console.warn('Cache parse error', e);
                    }
                }
            }

            // 2. Fetch from API
            const statusesToFetch = filters.statuses?.length > 0 ? filters.statuses : visibleStatuses;

            const { orders: fetchedOrders } = await ordersAPI.getAll({
                minimal: true,
                ...filters,
                statuses: statusesToFetch,
            });

            setOrders(fetchedOrders);

            // 3. Update Cache
            if (isDefaultFilters) {
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    data: fetchedOrders,
                    timestamp: Date.now(),
                    statuses: visibleStatuses
                }));
            }

        } catch (error: any) {
            console.error('Error fetching orders:', error);
            if (!isBackground) message.error('Ошибка загрузки заявок');
        } finally {
            if (!isBackground) setLoading(false);
        }
    }, [filters, visibleStatuses]);

    // Socket Subscription
    useEffect(() => {
        if (!socket) return;

        const handleNewOrder = (newOrder: Order) => {
            // Only add if status is visible
            if (!visibleStatuses.includes(newOrder.status)) return;

            setOrders(prev => {
                if (prev.some(d => d.id === newOrder.id)) return prev;
                return [newOrder, ...prev];
            });
        };

        const handleOrderUpdated = (updatedOrder: Order) => {
            // Logic: Merge with existing to preserve local fields (like tags, unread_count)
            setOrders(prev => {
                // If status changed to invisible, remove it
                if (!visibleStatuses.includes(updatedOrder.status)) {
                    return prev.filter(o => o.id !== updatedOrder.id);
                }

                const existing = prev.find(o => o.id === updatedOrder.id);
                if (existing) {
                    return prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder, contact: updatedOrder.contact || o.contact } : o);
                } else {
                    // If not found but should be visible (e.g. moved into view), add it
                    // ideally we should fetch it fully, but for now add what we have
                    return [updatedOrder, ...prev];
                }
            });
        };

        const handleOrderDeleted = ({ id }: { id: number }) => {
            setOrders(prev => prev.filter(o => o.id !== id));
            // Update cache
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (parsed.data) {
                        parsed.data = parsed.data.filter((o: Order) => o.id !== id);
                        localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
                    }
                }
            } catch (e) { }
        };

        socket.on('new_order', handleNewOrder);
        socket.on('order_updated', handleOrderUpdated);
        socket.on('order_deleted', handleOrderDeleted);

        return () => {
            socket.off('new_order', handleNewOrder);
            socket.off('order_updated', handleOrderUpdated);
            socket.off('order_deleted', handleOrderDeleted);
        };
    }, [socket, visibleStatuses]);

    // Initial Fetch
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]); // fetchOrders depends on stringified filters/statuses so it triggers correctly

    return {
        orders,
        setOrders,
        loading,
        refreshOrders: () => fetchOrders(true),
        fetchOrders, // exposed if needed manually
    };
};
