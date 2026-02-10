import { Request, Response } from 'express';
import managerService from '../services/managerService';

class ManagerController {
    async getAll(req: Request, res: Response) {
        try {
            const managers = await managerService.getAll();
            res.json(managers);
        } catch (error: any) {
            console.error('Error fetching managers:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const data = await managerService.create(req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating manager:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = await managerService.update(id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating manager:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const result = await managerService.delete(id as string, manager.id);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting manager:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async updateNotificationSettings(req: Request, res: Response) {
        try {
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { notification_settings } = req.body;
            const data = await managerService.updateNotificationSettings(manager.id, notification_settings);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating notification settings:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

export default new ManagerController();
