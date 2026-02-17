import api from './client';
import { Manager } from '../../types';

export const authAPI = {
    login: async (email: string, password: string): Promise<{ token: string; manager: Manager }> => {
        const response = await api.post('/auth/login', { email, password });
        return response.data;
    },

    // TEMPORARY: Quick login without password
    quickLogin: async (): Promise<{ token: string; manager: Manager }> => {
        const response = await api.post('/auth/quick-login');
        return response.data;
    },

    register: async (email: string, password: string, name: string): Promise<{ token: string; manager: Manager }> => {
        const response = await api.post('/auth/register', { email, password, name });
        return response.data;
    },

    forgotPassword: async (email: string): Promise<{ success: boolean; message: string }> => {
        const response = await api.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
        const response = await api.post('/auth/reset-password', { token, password });
        return response.data;
    },

    verifyResetToken: async (token: string): Promise<{ valid: boolean; email?: string; error?: string }> => {
        const response = await api.get(`/auth/verify-reset-token/${token}`);
        return response.data;
    },
};
