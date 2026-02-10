import api from './client';
import { Tag } from '../../types';

export const tagsAPI = {
    getAll: async (): Promise<Tag[]> => {
        const response = await api.get('/tags');
        return response.data;
    },

    create: async (tag: { name: string; color: string }): Promise<Tag> => {
        const response = await api.post('/tags', tag);
        return response.data;
    },

    update: async (id: number, tag: { name: string; color: string }): Promise<Tag> => {
        const response = await api.patch(`/tags/${id}`, tag);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/tags/${id}`);
    },

    assignToOrder: async (orderId: number, tagId: number): Promise<void> => {
        await api.post(`/tags/order/${orderId}/assign`, { tag_id: tagId });
    },

    removeFromOrder: async (orderId: number, tagId: number): Promise<void> => {
        await api.delete(`/tags/order/${orderId}/remove/${tagId}`);
    },

    getByOrderId: async (orderId: number): Promise<Tag[]> => {
        const response = await api.get(`/tags/order/${orderId}`);
        return response.data;
    },

    getSettings: async (): Promise<{ disable_user_tag_creation: boolean }> => {
        const response = await api.get('/tags/settings');
        return response.data;
    },

    updateSettings: async (settings: { disable_user_tag_creation: boolean }): Promise<any> => {
        const response = await api.post('/tags/settings', settings);
        return response.data;
    }
};
