import api from './client';
import { Message } from '../../types';

export const messagesAPI = {
    getByLeadId: async (leadId: string | number, params?: { limit?: number; offset?: number }): Promise<Message[]> => {
        const response = await api.get(`/messages/lead/${leadId}`, { params });
        return response.data;
    },

    addReaction: async (messageId: number, emoji: string): Promise<Message> => {
        const response = await api.post(`/messages/${messageId}/reactions`, { emoji });
        return response.data;
    },
};
