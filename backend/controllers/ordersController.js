const ordersService = require('../services/ordersService');

class OrdersController {

    // GET /
    async getAll(req, res) {
        try {
            const result = await ordersService.getAll(req.query, req.manager);

            // Post-fetch filtering for tags if needed (since it was complex to move purely to DB service without refactoring filters object completely)
            if (req.query.tags) {
                const tagsFilter = Array.isArray(req.query.tags) ? req.query.tags : req.query.tags.split(',');
                const tagsSet = new Set(tagsFilter.map(t => parseInt(t)));
                // Filter result.orders
                result.orders = result.orders.filter(order => order.tags.some(tag => tagsSet.has(tag.id)));
            }

            res.json(result);
        } catch (error) {
            console.error('Error fetching orders:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // GET /unread-count
    async getUnreadCount(req, res) {
        try {
            const count = await ordersService.getUnreadCount(req.manager.id);
            res.json({ count });
        } catch (error) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // GET /:id
    async getById(req, res) {
        try {
            const order = await ordersService.getById(req.params.id);
            if (!order) return res.status(404).json({ error: 'Order not found' });
            res.json(order);
        } catch (error) {
            console.error('Error fetching order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /
    async create(req, res) {
        try {
            const io = req.app.get('io');
            const order = await ordersService.create(req.body, req.manager, io);
            res.json(order);
        } catch (error) {
            console.error('Error creating order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // PATCH /:id
    async update(req, res) {
        try {
            const io = req.app.get('io');
            const order = await ordersService.update(req.params.id, req.body, req.manager, io);
            res.json(order);
        } catch (error) {
            console.error('Error updating order:', error);
            if (error.message === 'Order not found') return res.status(404).json({ error: 'Order not found' });
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /:id
    async delete(req, res) {
        try {
            const io = req.app.get('io');
            await ordersService.delete(req.params.id, io);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting order:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // DELETE /unsorted (Admin only)
    async clearUnsorted(req, res) {
        try {
            console.log(`[Orders] Clear Unsorted requested by ${req.manager.email}`);
            const count = await ordersService.clearUnsorted(req.manager);
            console.log(`[Orders] Cleared ${count} unsorted/new orders`);
            res.json({ success: true, count });
        } catch (error) {
            console.error('Error clearing unsorted:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /bulk/status
    async bulkUpdateStatus(req, res) {
        try {
            const { ids, status } = req.body;
            const io = req.app.get('io');
            const count = await ordersService.bulkUpdateStatus(ids, status, req.manager, io);
            res.json({ success: true, updatedCount: count });
        } catch (error) {
            console.error('Bulk update error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    // POST /bulk/delete
    async bulkDelete(req, res) {
        try {
            const { ids } = req.body;
            const io = req.app.get('io');
            const count = await ordersService.bulkDelete(ids, io);
            res.json({ success: true, count });
        } catch (error) {
            console.error('Bulk delete error:', error);
            res.status(400).json({ error: error.message });
        }
    }
}

module.exports = new OrdersController();
