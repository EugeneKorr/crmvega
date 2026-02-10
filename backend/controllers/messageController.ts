import { Request, Response } from 'express';
import messageService from '../services/messageService';

class MessageController {
    async getByLead(req: Request, res: Response) {
        try {
            const { leadId } = req.params;
            const { limit, offset } = req.query;
            const messages = await messageService.getByLead(
                leadId as string,
                limit ? parseInt(limit as string) : undefined,
                offset ? parseInt(offset as string) : undefined
            );
            res.json(messages);
        } catch (error: any) {
            console.error('Error fetching messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getByContact(req: Request, res: Response) {
        try {
            const { contactId } = req.params;
            const { limit, offset } = req.query;
            const result = await messageService.getByContact(
                contactId as string,
                limit ? parseInt(limit as string) : undefined,
                offset ? parseInt(offset as string) : undefined
            );
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching contact messages:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendToContact(req: Request, res: Response) {
        try {
            const { contactId } = req.params;
            const { content, sender_type } = req.body;
            const manager = (req as any).manager;

            const message = await messageService.sendToContact(contactId as string, content, sender_type, manager);
            res.json(message);
        } catch (error: any) {
            console.error('Error sending message to contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendVoiceToContact(req: Request, res: Response) {
        try {
            const { contactId } = req.params;
            const { duration } = req.body;
            const manager = (req as any).manager;
            const file = req.file;

            if (!file) return res.status(400).json({ error: 'File not found' });

            const message = await messageService.sendVoiceToContact(contactId as string, file, duration, manager);
            res.json(message);
        } catch (error: any) {
            console.error('Error sending voice to contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async sendFileToContact(req: Request, res: Response) {
        try {
            const { contactId } = req.params;
            const { caption } = req.body;
            const manager = (req as any).manager;
            const file = req.file;

            if (!file) return res.status(400).json({ error: 'File not found' });

            const message = await messageService.sendFileToContact(contactId as string, file, caption, manager);
            res.json(message);
        } catch (error: any) {
            console.error('Error sending file to contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async addReaction(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { emoji } = req.body;
            const manager = (req as any).manager;

            const message = await messageService.addReaction(id as string, emoji, manager);
            res.json(message);
        } catch (error: any) {
            console.error('Error adding reaction:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new MessageController();
