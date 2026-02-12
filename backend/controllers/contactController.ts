import { Request, Response } from 'express';
import contactService from '../services/contactService';

class ContactController {
    async getAll(req: Request, res: Response) {
        try {
            const { search, status, limit, offset } = req.query;
            const result = await contactService.getAll({
                search: search as string,
                status: status as string,
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined
            });
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching contacts:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getSummary(req: Request, res: Response) {
        try {
            const { limit, offset, search, unread, statuses } = req.query;
            const result = await contactService.getSummary({
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
                search: search as string,
                unread: unread === 'true',
                statuses: statuses as string
            });
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching inbox summary:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const contact = await contactService.getById(id as string);
            if (!contact) {
                return res.status(404).json({ error: 'Contact not found' });
            }
            res.json(contact);
        } catch (error: any) {
            console.error('Error fetching contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await contactService.create(req.body, manager.id);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = await contactService.update(id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await contactService.delete(id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting contact:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async markMessagesRead(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await contactService.markMessagesRead(id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error marking contact messages as read:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new ContactController();
