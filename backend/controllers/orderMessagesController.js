const orderService = require('../services/orderMessagesService');
const fs = require('fs');

class OrderMessagesController {

    // --- Client Messages ---

    async getClientMessages(req, res) {
        try {
            const { orderId } = req.params;
            const { limit, offset } = req.query;
            const result = await orderService.getClientMessages(orderId, limit, offset);
            res.json(result);
        } catch (error) {
            console.error('Error fetching client messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendClientMessage(req, res) {
        try {
            const { orderId } = req.params;
            const { content, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientMessage({
                orderId,
                content,
                replyToMessageId: reply_to_message_id,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending client message:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendClientFile(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { caption, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientFile({
                orderId,
                file: req.file,
                caption,
                replyToMessageId: reply_to_message_id,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending client file:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async sendClientVoice(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { duration, reply_to_message_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendClientVoice({
                orderId,
                file: req.file,
                duration,
                replyToMessageId: reply_to_message_id,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending client voice:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async markClientMessagesRead(req, res) {
        try {
            const { orderId } = req.params;
            await orderService.markClientMessagesRead(orderId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking client messages read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async markAllRead(req, res) {
        try {
            await orderService.markAllRead();
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking all read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // --- Internal Messages ---

    async getInternalMessages(req, res) {
        try {
            const { orderId } = req.params;
            const { limit, offset } = req.query;
            const result = await orderService.getInternalMessages(orderId, limit, offset);
            res.json(result);
        } catch (error) {
            console.error('Error fetching internal messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendInternalMessage(req, res) {
        try {
            const { orderId } = req.params;
            const { content, reply_to_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalMessage({
                orderId,
                content,
                replyToId: reply_to_id,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending internal message:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendInternalFile(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

            const { orderId } = req.params;
            const { reply_to_id } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalFile({
                orderId,
                file: req.file,
                replyToId: reply_to_id,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending internal file:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async sendInternalVoice(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
            const { orderId } = req.params;
            const { duration } = req.body;
            const io = req.app.get('io');

            const result = await orderService.sendInternalVoice({
                orderId,
                file: req.file,
                duration,
                managerId: req.manager.id
            }, io);

            res.json(result);
        } catch (error) {
            console.error('Error sending internal voice:', error);
            res.status(400).json({ error: error.message });
        } finally {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (e) { }
            }
        }
    }

    async markInternalMessagesRead(req, res) {
        try {
            const { orderId } = req.params;
            await orderService.markInternalMessagesRead(orderId, req.manager.id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking internal read:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getUnreadInternalCount(req, res) {
        try {
            const { orderId } = req.params;
            const count = await orderService.getUnreadInternalCount(orderId, req.manager.id);
            res.json({ count });
        } catch (error) {
            console.error('Error getting unread count:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getTimeline(req, res) {
        try {
            const { orderId } = req.params;
            const { limit, before } = req.query;
            const result = await orderService.getTimeline(orderId, limit, before);
            res.json(result);
        } catch (error) {
            console.error('Error fetching timeline:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new OrderMessagesController();
