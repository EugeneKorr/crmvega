import api from './client';
import { Message, InternalMessage } from '../../types';

export const orderMessagesAPI = {
    getClientMessages: async (orderId: number, params?: { limit?: number; offset?: number }): Promise<{
        messages: Message[];
        total: number;
        chatLeadId?: string;
        externalId?: string;
        mainId?: string;
    }> => {
        const response = await api.get(`/order-messages/${orderId}/client`, { params });
        return response.data;
    },

    sendClientMessage: async (orderId: number, content: string, replyToMessageId?: number): Promise<Message> => {
        const response = await api.post(`/order-messages/${orderId}/client`, {
            content,
            reply_to_message_id: replyToMessageId,
        });
        return response.data;
    },

    sendClientFile: async (orderId: number, file: File, caption?: string, replyToMessageId?: number): Promise<Message> => {
        const formData = new FormData();
        formData.append('file', file);
        if (caption) formData.append('caption', caption);
        if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

        const response = await api.post(`/order-messages/${orderId}/client/file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    sendClientVoice: async (orderId: number, voice: Blob, duration?: number, replyToMessageId?: number): Promise<Message> => {
        const formData = new FormData();
        let fileName = 'voice.ogg';
        if (voice.type.includes('webm')) fileName = 'voice.webm';
        else if (voice.type.includes('mp4')) fileName = 'voice.mp4';

        formData.append('voice', voice, fileName);
        if (duration) formData.append('duration', duration.toString());
        if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId.toString());

        const response = await api.post(`/order-messages/${orderId}/client/voice`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    markClientMessagesAsRead: async (orderId: number): Promise<void> => {
        await api.post(`/order-messages/${orderId}/client/read`);
    },

    markAllRead: async (): Promise<{ success: boolean; count: number }> => {
        const response = await api.post(`/order-messages/read-all`);
        return response.data;
    },

    getInternalMessages: async (orderId: number, params?: { limit?: number; offset?: number }): Promise<{
        messages: InternalMessage[];
        total: number;
    }> => {
        const response = await api.get(`/order-messages/${orderId}/internal`, { params });
        return response.data;
    },

    sendInternalMessage: async (orderId: number, content: string, replyToId?: number): Promise<InternalMessage> => {
        const response = await api.post(`/order-messages/${orderId}/internal`, {
            content,
            reply_to_id: replyToId,
        });
        return response.data;
    },

    sendInternalFile: async (orderId: number, file: File, replyToId?: number): Promise<InternalMessage> => {
        const formData = new FormData();
        formData.append('file', file);
        if (replyToId) formData.append('reply_to_id', replyToId.toString());

        const response = await api.post(`/order-messages/${orderId}/internal/file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    sendInternalVoice: async (orderId: number, voice: Blob, duration?: number): Promise<InternalMessage> => {
        const formData = new FormData();
        let fileName = 'voice.ogg';
        if (voice.type.includes('webm')) fileName = 'voice.webm';
        else if (voice.type.includes('mp4')) fileName = 'voice.mp4';

        formData.append('voice', voice, fileName);
        if (duration) formData.append('duration', duration.toString());

        const response = await api.post(`/order-messages/${orderId}/internal/voice`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    markAsRead: async (orderId: number, messageIds?: number[]): Promise<void> => {
        await api.post(`/order-messages/${orderId}/internal/read`, { message_ids: messageIds });
    },

    getUnreadCount: async (orderId: number): Promise<{ count: number }> => {
        const response = await api.get(`/order-messages/${orderId}/internal/unread`);
        return response.data;
    },

    getTimeline: async (orderId: number, params?: { limit?: number; before?: string }): Promise<{
        messages: (Message | InternalMessage)[];
        meta: {
            total_fetched: number;
            limit: number;
            has_more: boolean;
        }
    }> => {
        const response = await api.get(`/order-messages/${orderId}/timeline`, { params });
        return response.data;
    },
};
