import api from './client';
import { Order } from '../../types';

export const ordersAPI = {
    getAll: async (params?: { contact_id?: number; status?: string; limit?: number; offset?: number; minimal?: boolean }): Promise<{ orders: Order[] }> => {
        const response = await api.get('/orders', { params });
        return response.data;
    },

    getById: async (id: number | string): Promise<Order> => {
        const response = await api.get(`/orders/${id}`);
        return response.data;
    },

    create: async (order: Omit<Order, 'id' | 'created_at' | 'updated_at'>): Promise<Order> => {
        const response = await api.post('/orders', order);
        return response.data;
    },

    update: async (id: number | string, order: Partial<Order>): Promise<Order> => {
        const response = await api.patch(`/orders/${id}`, order);
        return response.data;
    },

    delete: async (id: number | string): Promise<void> => {
        await api.delete(`/orders/${id}`);
    },

    clearUnsorted: async (): Promise<{ success: boolean; count: number }> => {
        const response = await api.delete('/orders/unsorted');
        return response.data;
    },

    getUnreadCount: async (): Promise<{ count: number }> => {
        const response = await api.get('/orders/unread-count');
        return response.data;
    },

    bulkUpdateStatus: async (ids: number[], status: string): Promise<{ success: boolean; updatedCount: number }> => {
        const response = await api.post('/orders/bulk/status', { ids, status });
        return response.data;
    },

    bulkDelete: async (ids: number[]): Promise<{ success: boolean; count: number }> => {
        const response = await api.post('/orders/bulk/delete', { ids });
        return response.data;
    },
};
