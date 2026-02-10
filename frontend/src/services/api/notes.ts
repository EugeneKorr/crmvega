import api from './client';
import { Note } from '../../types';

export const notesAPI = {
    getByContactId: async (contactId: number): Promise<Note[]> => {
        const response = await api.get(`/notes/contact/${contactId}`);
        return response.data;
    },

    getByOrderId: async (orderId: number): Promise<Note[]> => {
        const response = await api.get(`/notes/order/${orderId}`);
        return response.data;
    },

    create: async (note: Omit<Note, 'id' | 'created_at' | 'updated_at' | 'manager'>): Promise<Note> => {
        const response = await api.post('/notes', note);
        return response.data;
    },

    update: async (id: number, note: Partial<Note>): Promise<Note> => {
        const response = await api.patch(`/notes/${id}`, note);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await api.delete(`/notes/${id}`);
    },
};
