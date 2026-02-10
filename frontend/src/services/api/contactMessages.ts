import api from './client';
import { Message } from '../../types';

export const contactMessagesAPI = {
    getByContactId: async (contactId: number, params?: { limit?: number; offset?: number }): Promise<{ messages: Message[], total: number }> => {
        const response = await api.get(`/messages/contact/${contactId}`, { params });
        if (Array.isArray(response.data)) {
            return { messages: response.data, total: response.data.length };
        }
        return response.data;
    },

    sendToContact: async (contactId: number, content: string, author_type?: 'manager' | 'user'): Promise<Message> => {
        const response = await api.post(`/messages/contact/${contactId}`, { content, sender_type: author_type });
        return response.data;
    },

    sendVoice: async (contactId: number, voice: Blob, duration?: number): Promise<Message> => {
        const formData = new FormData();
        let fileName = 'voice.ogg';
        if (voice.type.includes('webm')) fileName = 'voice.webm';
        else if (voice.type.includes('mp4')) fileName = 'voice.mp4';

        formData.append('voice', voice, fileName);
        if (duration) formData.append('duration', duration.toString());

        const response = await api.post(`/messages/contact/${contactId}/voice`, formData);
        return response.data;
    },

    sendFile: async (contactId: number, file: File, caption?: string): Promise<Message> => {
        const formData = new FormData();
        formData.append('file', file);
        if (caption) formData.append('caption', caption);

        const response = await api.post(`/messages/contact/${contactId}/file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },
};
