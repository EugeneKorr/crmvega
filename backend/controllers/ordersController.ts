import { Request, Response } from 'express';
import ordersService from '../services/ordersService';

// Define a type for the manager attached to the request, asserting it has the necessary properties
// In a real app, we might want to strictly type JwtPayload in auth.ts
interface Manager {
    id: number | string;
    email?: string;
    role?: string;
    [key: string]: any;
}

class OrdersController {

    // GET /
    async getAll(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const result = await ordersService.getAll(req.query as any, manager) as any;

            // Post-fetch filtering for tags if needed (since it was complex to move purely to DB service without refactoring filters object completely)
            if (req.query.tags) {
                const tagsParam = req.query.tags as string | string[];
                const tagsFilter = Array.isArray(tagsParam) ? tagsParam : tagsParam.split(',');
                const tagsSet = new Set(tagsFilter.map(t => parseInt(t)));
                // Filter result.orders
                if (result.orders) {
                    result.orders = result.orders.filter((order: any) => order.tags && order.tags.some((tag: any) => tagsSet.has(tag.id)));
                }
            }

            res.json(result);
        } catch (error: any) {
            console.error('Error fetching orders:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // GET /unread-count
    async getUnreadCount(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const count = await ordersService.getUnreadCount(manager.id);
            res.json({ count });
        } catch (error: any) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // GET /:id
    async getById(req: Request, res: Response) {
        try {
            const order = await ordersService.getById(req.params.id as string);
            if (!order) return res.status(404).json({ error: 'Order not found' });
            res.json(order);
        } catch (error: any) {
            console.error('Error fetching order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /
    async create(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const order = await ordersService.create(req.body, manager);
            res.json(order);
        } catch (error: any) {
            console.error('Error creating order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // PATCH /:id
    async update(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const order = await ordersService.update(req.params.id as string, req.body, manager);
            res.json(order);
        } catch (error: any) {
            console.error('Error updating order:', error);
            if (error.message === 'Order not found') return res.status(404).json({ error: 'Order not found' });
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /:id
    async delete(req: Request, res: Response) {
        try {
            await ordersService.delete(req.params.id as string);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error deleting order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /unsorted (Admin only)
    async clearUnsorted(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            console.log(`[Orders] Clear Unsorted requested by ${manager.email}`);
            const count = await ordersService.clearUnsorted(manager);
            console.log(`[Orders] Cleared ${count} unsorted/new orders`);
            res.json({ success: true, count });
        } catch (error: any) {
            console.error('Error clearing unsorted:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /bulk/status
    async bulkUpdateStatus(req: Request, res: Response) {
        try {
            const manager = req.manager as Manager;
            if (!manager) return res.status(401).json({ error: 'Unauthorized' });

            const { ids, status } = req.body;
            const count = await ordersService.bulkUpdateStatus(ids, status, manager);
            res.json({ success: true, updatedCount: count });
        } catch (error: any) {
            console.error('Bulk update error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /bulk/delete
    async bulkDelete(req: Request, res: Response) {
        try {
            const { ids } = req.body;
            const count = await ordersService.bulkDelete(ids);
            res.json({ success: true, count });
        } catch (error: any) {
            console.error('Bulk delete error:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

export default new OrdersController();
