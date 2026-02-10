import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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
import json5Parser from './middleware/json5Parser';

dotenv.config();

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

const io = new Server(server, {
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (!origin) return callback(null, true);
            const allowedOrigins = getAllowedOrigins();
            if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

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

// Сохраняем io в app для доступа из routes
app.set('io', io);

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

// Логирование всех зарегистрированных роутов
console.log('✅ Routes registered:');
console.log('  - /api/webhook/bubble');
console.log('  - /api/orders');
console.log('  - /api/order-messages');

// Root Endpoint for Health Checks (Render requires this often)
app.get('/', (req: Request, res: Response) => {
    res.status(200).send('CRM Backend is running');
});

// Socket.IO для real-time общения
io.on('connection', (socket: Socket) => {
    // Глобальная комната для всех менеджеров
    socket.join('crm_users');
    console.log('✅ User connected:', socket.id, 'joined crm_users');

    // Присоединение к комнате пользователя
    socket.on('join_user', (userId: string | number) => {
        socket.join(`user_${userId}`);
    });

    // Присоединение к комнате main_id (Bubble deal ID)
    socket.on('join_main', (mainId: string | number) => {
        socket.join(`main_${mainId}`);
        console.log(`Socket ${socket.id} joined main_${mainId}`);
    });

    // Присоединение к комнате ордера (бывшая сделка)
    socket.on('join_order', (orderId: string | number) => {
        socket.join(`order_${orderId}`);
        console.log(`Socket ${socket.id} joined order_${orderId}`);
    });

    // Выход из комнаты ордера
    socket.on('leave_order', (orderId: string | number) => {
        socket.leave(`order_${orderId}`);
    });

    // Присоединение к комнате контакта
    socket.on('join_contact', (contactId: string | number) => {
        socket.join(`contact_${contactId}`);
        console.log(`Socket ${socket.id} joined contact_${contactId}`);
    });

    // Отправка сообщения
    socket.on('send_message', async (data: any) => {
        try {
            const { leadId, message, senderId, senderType } = data;

            // Сохраняем сообщение в базе
            const { data: savedMessage, error } = await supabase
                .from('messages')
                .insert({
                    lead_id: leadId,
                    content: message,
                    sender_id: senderId,
                    sender_type: senderType
                })
                .select()
                .single();

            if (error) throw error;

            // Отправляем сообщение всем в комнате main_id
            // mainId is essentially leadId in this context (based on schema)
            const mainId = leadId;

            if (mainId) {
                io.to(`main_${mainId}`).emit('new_message', savedMessage);
            }

        } catch (error: any) {
            console.error('Error sending message:', error);
            socket.emit('message_error', { error: error.message });
        }
    });

    socket.on('disconnect', (reason: string) => {
        console.log('❌ User disconnected:', socket.id, 'reason:', reason);
    });

    socket.on('error', (error: Error) => {
        console.error('Socket error:', error);
    });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('🔥 Global Error Handler:', err);
    console.error('Stack:', err.stack);

    // Ensure JSON response
    if (!res.headersSent) {
        res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
