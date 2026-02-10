import api from './client';
import { Manager } from '../../types';

export const managersAPI = {
    getAll: async (): Promise<Manager[]> => {
        const response = await api.get('/managers');
        return response.data;
    },

    create: async (manager: { email: string; password: string; name: string; role: string }): Promise<Manager> => {
        const response = await api.post('/managers', manager);
        return response.data;
    },

    update: async (id: number, manager: { name?: string; role?: string; password?: string }): Promise<Manager> => {
        const response = await api.patch(`/managers/${id}`, manager);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/managers/${id}`);
    },

    updateNotificationSettings: async (settings: any): Promise<{ notification_settings: any }> => {
        const response = await api.put('/managers/settings/notifications', { notification_settings: settings });
        return response.data;
    },
};
