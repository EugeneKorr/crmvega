import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { ordersAPI } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { Order, OrderStatus } from '../types';

export const useOrder = (id: string | undefined) => {
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(false);
    const { socket } = useSocket();

    const fetchOrder = useCallback(async () => {
        if (!id) return;
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
    }, [id]);

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

    // Socket Logic
    useEffect(() => {
        if (!socket || !id) return;

        const handleOrderUpdated = (updatedOrder: Order) => {
            // Check if this update relates to current order
            // Using strict string comparison for IDs to handle potential type mismatches
            const currentIdStr = String(id);
            const updatedIdStr = String(updatedOrder.id);
            const updatedMainIdStr = String(updatedOrder.main_id);

            if (updatedIdStr === currentIdStr || updatedMainIdStr === currentIdStr) {
                // Merge to preserve local fields not in payload (tags, etc)
                setOrder(prev => prev ? {
                    ...prev,
                    ...updatedOrder,
                    // Preserve nested objects if missing in update
                    contact: updatedOrder.contact || prev.contact,
                    tags: updatedOrder.tags || prev.tags,
                    unread_count: updatedOrder.unread_count ?? prev.unread_count
                } : updatedOrder);
            }
        };

        socket.on('order_updated', handleOrderUpdated);

        // Join specific room if needed (mostly backend handles broadcasting)
        socket.emit('join_order', id);

        return () => {
            socket.off('order_updated', handleOrderUpdated);
            socket.emit('leave_order', id);
        };
    }, [socket, id]);

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
