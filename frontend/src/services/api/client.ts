import axios from 'axios';
import { Manager } from '../../types';

// Backend is deployed on Render (not Vercel!)
// Production URL is set via VITE_API_URL in Vercel environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

console.log('API Service Loaded: v2.1.0 (Refactored)');

const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const currentPath = window.location.pathname;
            if (!currentPath.includes('/login') && !currentPath.includes('/reset-password')) {
                localStorage.removeItem('token');
                localStorage.removeItem('manager');
                window.location.href = '/login?expired=1';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
