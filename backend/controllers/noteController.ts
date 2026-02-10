import { Request, Response } from 'express';
import noteService from '../services/noteService';

class NoteController {
    async getByContact(req: Request, res: Response) {
        try {
            const { contactId } = req.params;
            const data = await noteService.getByContact(contactId as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching notes:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getByOrder(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const data = await noteService.getByOrder(orderId as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching notes:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await noteService.create(req.body, manager);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating note:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await noteService.update(id as string, req.body, manager.id);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating note:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const result = await noteService.delete(id as string, manager.id);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting note:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new NoteController();
