import api from './client';
import { AIAnalytics } from '../../types'; // Assuming this exists or using any

export const analyticsAPI = {
    getOrdersAnalytics: async (params?: { startDate?: string; endDate?: string }) => {
        const response = await api.get('/analytics/orders', { params });
        return response.data;
    },

    getContactsAnalytics: async () => {
        const response = await api.get('/analytics/contacts');
        return response.data;
    },
};
