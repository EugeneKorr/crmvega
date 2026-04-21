import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { createClient } from '@supabase/supabase-js';
import path from 'path';

// Import routes
import authRoutes from './routes/auth';
import messagesRoutes from './routes/messages';
import botRoutes from './routes/bot';
import contactsRoutes from './routes/contacts';
import ordersRoutes from './routes/orders';
import notesRoutes from './routes/notes';
import analyticsRoutes from './routes/analytics';
import automationsRoutes from './routes/automations';
import aiRoutes from './routes/ai';
import managersRoutes from './routes/managers';
import bubbleRoutes from './routes/bubble';
import orderMessagesRoutes from './routes/orderMessages';
import tagsRoutes from './routes/tags';
import uploadRoutes from './routes/upload';
import errorBotRoutes from './routes/errorBot';
import logsRoutes from './routes/logs';
import json5Parser from './middleware/json5Parser';



const app = express();
const server = createServer(app);

const getAllowedOrigins = () => {
    const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
    const defaultOrigins = [
        process.env.FRONTEND_URL,
        'http://localhost:3000',
        'https://crmvega.vercel.app'
    ].filter(Boolean) as string[];

    return [...new Set([...envOrigins, ...defaultOrigins])];
};

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

// Middleware
const corsOptions: cors.CorsOptions = {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Разрешаем запросы без origin (например, мобильные приложения, Postman)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'https://crmvega.vercel.app',
            'https://*.vercel.app'
        ].filter(Boolean) as string[];

        // Проверяем точное совпадение или домены Vercel
        if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
// Custom JSON parser to handle Bubble's invalid JSON (unquoted yes/no)
app.use(express.text({ type: 'application/json' }));
app.use(json5Parser); // Use JSON5 for loose parsing

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/automations', automationsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/managers', managersRoutes);
app.use('/api/webhook/bubble', bubbleRoutes);
app.use('/api/order-messages', orderMessagesRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/error-bot', errorBotRoutes);
app.use('/api/logs', logsRoutes);

// Логирование всех зарегистрированных роутов
console.log('✅ Routes registered:');
console.log('  - /api/webhook/bubble');
console.log('  - /api/orders');
console.log('  - /api/order-messages');

// Root Endpoint for Health Checks (Render requires this often)
app.get('/', (req: Request, res: Response) => {
    res.status(200).send('CRM Backend is running');
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('🔥 Global Error Handler:', err);
    console.error('Stack:', err.stack);

    // Ensure JSON response
    if (!res.headersSent) {
        res.status(err.status || 500).json({
            success: false, // Legacy format compatibility if needed
            error: err.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
