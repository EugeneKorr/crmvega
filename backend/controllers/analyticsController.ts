import { Request, Response } from 'express';
import analyticsService from '../services/analyticsService';

class AnalyticsController {
    async getOrders(req: Request, res: Response) {
        try {
            const { startDate, endDate } = req.query;
            const result = await analyticsService.getOrdersAnalytics(startDate as string, endDate as string);
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching analytics:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async getContacts(req: Request, res: Response) {
        try {
            const result = await analyticsService.getContactsAnalytics();
            res.json(result);
        } catch (error: any) {
            console.error('Error fetching contacts analytics:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new AnalyticsController();
