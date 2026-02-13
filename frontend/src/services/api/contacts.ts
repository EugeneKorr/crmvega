import api from './client';
import { Contact, InboxContact } from '../../types';
import { uploadAPI } from './upload';

export const contactsAPI = {
    getAll: async (params?: { search?: string; status?: string; limit?: number; offset?: number }): Promise<{ contacts: Contact[] }> => {
        const response = await api.get('/contacts', { params });
        return response.data;
    },

    getById: async (id: number | string): Promise<Contact> => {
        const response = await api.get(`/contacts/${id}`);
        return response.data;
    },

    create: async (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<Contact> => {
        const response = await api.post('/contacts', contact);
        return response.data;
    },

    update: async (id: number | string, contact: Partial<Contact>): Promise<Contact> => {
        const response = await api.patch(`/contacts/${id}`, contact);
        return response.data;
    },

    delete: async (id: number | string): Promise<void> => {
        await api.delete(`/contacts/${id}`);
    },

    getSummary: async (params?: { limit?: number; offset?: number; search?: string, unread?: boolean, statuses?: string }): Promise<InboxContact[]> => {
        const paramsWithCache = { ...params, _t: Date.now() };
        const response = await api.get('/contacts/summary', { params: paramsWithCache });
        return response.data;
    },

    markMessagesAsRead: async (contactId: number | string): Promise<void> => {
        await api.post(`/contacts/${contactId}/read-messages`);
    },

    uploadFile: async (file: File) => {
        return uploadAPI.uploadFile(file);
    },
};
