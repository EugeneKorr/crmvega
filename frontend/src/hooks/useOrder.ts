import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { ordersAPI } from '../services/api';
import { supabase } from '../lib/supabase';
import { Order, OrderStatus } from '../types';

export const useOrder = (id: string | undefined) => {
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchOrder = useCallback(async () => {
        if (!id || loading) return;
        setLoading(true);
        try {
            const data = await ordersAPI.getById(Number(id));
            setOrder(data);
        } catch (error: any) {
            console.error('Error fetching order:', error);
            message.error(error.response?.data?.error || 'Ошибка загрузки заявки');
        } finally {
            setLoading(false);
        }
    }, [id]); // loading removed from deps as it's handled internally

    const updateOrder = async (updateData: Partial<Order>) => {
        if (!order) return;
        try {
            const updated = await ordersAPI.update(order.id, updateData);
            // Optimistic update done in setOrder via socket usually, allows manual too
            setOrder(prev => prev ? { ...prev, ...updated, contact: updated.contact || prev.contact } : updated);
            message.success('Заявка обновлена');
            return updated;
        } catch (error: any) {
            console.error('Update error:', error);
            message.error('Ошибка обновления');
            throw error;
        }
    };

    const updateStatus = async (newStatus: OrderStatus) => {
        return updateOrder({ status: newStatus });
    };

    // Realtime Logic
    useEffect(() => {
        if (!id) return;

        const handleOrderUpdate = (payload: any) => {
            const updatedOrder = payload.new as Order;
            setOrder(prev => {
                if (!prev) return updatedOrder;
                // Verify it matches current order (redundant with filter mostly, but safe)
                if (String(prev.id) === String(updatedOrder.id)) {
                    return {
                        ...prev,
                        ...updatedOrder,
                        // Preserve nested objects if missing in update
                        contact: prev.contact, // Update doesn't usually return relations
                        tags: prev.tags,
                        unread_count: updatedOrder.unread_count ?? prev.unread_count
                    };
                }
                return prev;
            });
        };

        const channel = supabase.channel(`order_details:${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `id=eq.${id}`
                },
                handleOrderUpdate
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id]);

    useEffect(() => {
        fetchOrder();
    }, [fetchOrder]);

    return {
        order,
        loading,
        updateOrder,
        updateStatus,
        refreshOrder: fetchOrder
    };
};
