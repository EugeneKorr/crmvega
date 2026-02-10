import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { ordersAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus, ORDER_STATUSES } from '../types';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseOrdersProps {
    filters: any;
    visibleStatuses: OrderStatus[];
}

export const useOrders = ({ filters, visibleStatuses }: UseOrdersProps) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
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

    // Supabase Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel('orders_updates')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'orders' },
                async (payload: RealtimePostgresChangesPayload<Order>) => {
                    const newOrderRaw = payload.new as Order;
                    try {
                        const fullOrder = await ordersAPI.getById(newOrderRaw.id);
                        if (!visibleStatuses.includes(fullOrder.status)) return;
                        setOrders(prev => {
                            if (prev.some(d => d.id === fullOrder.id)) return prev;
                            return [fullOrder, ...prev];
                        });
                    } catch (e) {
                        console.error('Error fetching new order details', e);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                async (payload: RealtimePostgresChangesPayload<Order>) => {
                    const updatedOrderRaw = payload.new as Order;
                    try {
                        const fullOrder = await ordersAPI.getById(updatedOrderRaw.id);
                        setOrders(prev => {
                            const existingIndex = prev.findIndex(o => o.id === fullOrder.id);

                            // If not visible, remove
                            if (!visibleStatuses.includes(fullOrder.status)) {
                                return prev.filter(o => o.id !== fullOrder.id);
                            }

                            if (existingIndex !== -1) {
                                const updatedList = [...prev];
                                updatedList[existingIndex] = fullOrder;
                                return updatedList;
                            } else {
                                return [fullOrder, ...prev];
                            }
                        });
                    } catch (e) {
                        console.error('Error fetching updated order details', e);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'orders' },
                (payload: RealtimePostgresChangesPayload<Order>) => {
                    const id = (payload.old as Order).id;
                    setOrders(prev => prev.filter(o => o.id !== id));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [visibleStatuses]);

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
