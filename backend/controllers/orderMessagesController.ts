import { Request, Response } from 'express';
import orderService from '../services/orderMessagesService';
import fs from 'fs';

interface Manager {
    id: string | number;
    email?: string;
    role?: string;
    [key: string]: any;
}

// Multer adds 'file' to Request
interface MulterRequest extends Request {
    file?: Express.Multer.File;
}

class OrderMessagesController {

    // --- Client Messages ---

    async getClientMessages(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const { limit, offset } = req.query;
            const result = await orderService.getClientMessages(orderId as string, Number(limit) || 200, Number(offset) || 0);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching client messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendClientMessage(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { orderId } = req.params;
            const { content, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientMessage({
                orderId: orderId as string,
                content,
                replyToMessageId: reply_to_message_id,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending client message:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendClientFile(req: MulterRequest, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { caption, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientFile({
                orderId: orderId as string,
                file: req.file,
                caption,
                replyToMessageId: reply_to_message_id,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending client file:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async sendClientVoice(req: MulterRequest, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { duration, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientVoice({
                orderId: orderId as string,
                file: req.file,
                duration,
                replyToMessageId: reply_to_message_id,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending client voice:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async markClientMessagesRead(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            await orderService.markClientMessagesRead(orderId as string);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error marking client messages read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async markAllRead(req: Request, res: Response) {
        try {
            await orderService.markAllRead();
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error marking all read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // --- Internal Messages ---

    async getInternalMessages(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const { limit, offset } = req.query;
            const result = await orderService.getInternalMessages(orderId as string, Number(limit) || 200, Number(offset) || 0);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching internal messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendInternalMessage(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { orderId } = req.params;
            const { content, reply_to_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalMessage({
                orderId: orderId as string,
                content,
                replyToId: reply_to_id,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending internal message:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendInternalFile(req: MulterRequest, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { reply_to_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalFile({
                orderId: orderId as string,
                file: req.file,
                replyToId: reply_to_id,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending internal file:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async sendInternalVoice(req: MulterRequest, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
            const { orderId } = req.params;
            const { duration } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalVoice({
                orderId: orderId as string,
                file: req.file,
                duration,
                managerId: manager.id
            }, io);

            res.json(result);
        } catch (error: any) {
            console.error('Error sending internal voice:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async markInternalMessagesRead(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { orderId } = req.params;
            await orderService.markInternalMessagesRead(orderId as string, manager.id);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error marking internal read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getUnreadInternalCount(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { orderId } = req.params;
            const count = await orderService.getUnreadInternalCount(orderId as string, manager.id);
            res.json({ count });
        } catch (error: any) {
            console.error('Error getting unread count:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getTimeline(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const { limit, before } = req.query;
            const result = await orderService.getTimeline(orderId as string, Number(limit) || 50, before as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching timeline:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new OrderMessagesController();
