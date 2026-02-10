import api from './client';
import { Automation } from '../../types';

export const automationsAPI = {
    getAll: async (params?: { is_active?: boolean }): Promise<{ automations: Automation[] }> => {
        const response = await api.get('/automations', { params });
        return response.data;
    },

    getById: async (id: number): Promise<Automation> => {
        const response = await api.get(`/automations/${id}`);
        return response.data;
    },

    create: async (automation: Omit<Automation, 'id' | 'created_at' | 'updated_at' | 'manager'>): Promise<Automation> => {
        const response = await api.post('/automations', automation);
        return response.data;
    },

    update: async (id: number, automation: Partial<Automation>): Promise<Automation> => {
        const response = await api.patch(`/automations/${id}`, automation);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/automations/${id}`);
    },

    execute: async (id: number, entityType: string, entityId: number): Promise<void> => {
        await api.post(`/automations/${id}/execute`, { entityType, entityId });
    },
};
