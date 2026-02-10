import { Request, Response } from 'express';
import tagService from '../services/tagService';

class TagController {
    async getSettings(req: Request, res: Response) {
        try {
            const settings = await tagService.getSettings();
            res.json(settings);
        } catch (error: any) {
            res.json({ disable_user_tag_creation: false });
        }
    }

    async updateSettings(req: Request, res: Response) {
        try {
            const { disable_user_tag_creation } = req.body;
            const data = await tagService.updateSettings(disable_user_tag_creation);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating tag settings:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getAll(req: Request, res: Response) {
        try {
            const tags = await tagService.getAll();
            res.json(tags);
        } catch (error: any) {
            console.error('Error fetching tags:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async create(req: Request, res: Response) {
        try {
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await tagService.create(req.body, manager);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating tag:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await tagService.update(id as string, req.body, manager);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating tag:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const manager = (req as any).manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const result = await tagService.delete(id as string, manager);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting tag:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async assignToOrder(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const { tag_id } = req.body;
            const manager = (req as any).manager;

            const data = await tagService.assignToOrder(orderId as string, tag_id as string, manager);
            res.json(data);
        } catch (error: any) {
            console.error('Error assigning tag:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async removeFromOrder(req: Request, res: Response) {
        try {
            const { orderId, tagId } = req.params;
            const manager = (req as any).manager;

            const result = await tagService.removeFromOrder(orderId as string, tagId as string, manager);
            res.json(result);
        } catch (error: any) {
            console.error('Error removing tag:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getByOrder(req: Request, res: Response) {
        try {
            const { orderId } = req.params;
            const tags = await tagService.getByOrder(orderId as string);
            res.json(tags);
        } catch (error: any) {
            console.error('Error fetching order tags:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new TagController();
