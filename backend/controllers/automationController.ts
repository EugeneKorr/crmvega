import { Request, Response } from 'express';
import automationService from '../services/automationService';

interface Manager {
    id: string | number;
    [key: string]: any;
}

class AutomationController {
    async getAutomations(req: Request, res: Response) {
        try {
            const { is_active } = req.query;
            const isActive = is_active === undefined ? undefined : is_active === 'true';
            const data = await automationService.getAutomations(isActive);
            res.json({ automations: data });
        } catch (error: any) {
            console.error('Error fetching automations:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getAutomation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = await automationService.getAutomation(id as string);
            res.json(data);
        } catch (error: any) {
            console.error('Error fetching automation:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async createAutomation(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const data = await automationService.createAutomation(req.body, manager.id);
            res.json(data);
        } catch (error: any) {
            console.error('Error creating automation:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async updateAutomation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const data = await automationService.updateAutomation(id as string, req.body);
            res.json(data);
        } catch (error: any) {
            console.error('Error updating automation:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async deleteAutomation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await automationService.deleteAutomation(id as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error deleting automation:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async executeAutomation(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { entityType, entityId } = req.body;
            const result = await automationService.executeAutomation(id as string, entityType, entityId);
            res.json(result);
        } catch (error: any) {
            console.error('Error executing automation:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new AutomationController();
