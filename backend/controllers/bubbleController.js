const bubbleService = require('../services/bubbleService');
const { notifyErrorSubscribers } = require('../utils/notifyError');

class BubbleController {

    async test(req, res) {
        res.json({
            success: true,
            message: 'Bubble webhook endpoint is working (Controller)',
            endpoints: {
                message: 'POST /api/webhook/bubble/message',
                order: 'POST /api/webhook/bubble/order',
                contact: 'POST /api/webhook/bubble/contact',
                updateMessage: 'PATCH /api/webhook/bubble/message/:id',
                noteToUser: 'POST /api/webhook/bubble/note_to_user',
                noteToOrder: 'POST /api/webhook/bubble/note_to_order'
            }
        });
    }

    async createMessage(req, res) {
        try {
            console.log('[Bubble Webhook] POST /message', JSON.stringify(req.body, null, 2));
            const result = await bubbleService.processMessage(req.body, req.app.get('io'));
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error creating message from Bubble:', error);
            notifyErrorSubscribers(`🔴 Ошибка обработки сообщения из Bubble:\n${error.message}`);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateMessage(req, res) {
        try {
            const { id } = req.params;
            const result = await bubbleService.updateMessage(id, req.body, req.app.get('io'));
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error updating message from Bubble:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async createOrder(req, res) {
        try {
            const result = await bubbleService.processOrder(req.body, req.app.get('io'));
            console.log(`[Bubble Webhook] Created order ${result.id}`);
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error creating order from Bubble:', error);
            notifyErrorSubscribers(`🔴 Ошибка создания заявки из Bubble:\n${error.message}`);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async createContact(req, res) {
        try {
            console.log('[Bubble Webhook] contact:', JSON.stringify(req.body, null, 2));
            const result = await bubbleService.processContact(req.body);
            res.json({ success: true, data: result.data, action: result.action });
        } catch (error) {
            console.error('Error processing contact:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateStatus(req, res) {
        try {
            const result = await bubbleService.processStatusUpdate(req.body, req.app.get('io')); // Error in service call
            // Wait, processStatusUpdate signature is (leads, io)
            // req.body is { leads: ... }
            // So I should pass req.body.leads?
            // Service expects: if (!leads || !leads.status ... )
            // So I should pass req.body.leads if the service expects "leads" object, OR pass req.body and service extracts leads.
            // Let's check service again.
            // Service: async processStatusUpdate(leads, io) { if (!leads ...
            // Controller: await bubbleService.processStatusUpdate(req.body.leads, ...

            const updateResult = await bubbleService.processStatusUpdate(req.body.leads, req.app.get('io'));
            res.json({ success: true, ...updateResult });
        } catch (error) {
            console.error('Error processing status update:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async noteToUser(req, res) {
        try {
            const { user, note } = req.body;
            if (!user || !note) return res.status(400).json({ success: false, error: 'Missing user/note' });

            const result = await bubbleService.processNoteToUser(user, note, req.app.get('io'));
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('[Bubble Webhook] Error in note_to_user:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async noteToOrder(req, res) {
        try {
            const { main_id, note } = req.body;
            if (!main_id || !note) return res.status(400).json({ success: false, error: 'Missing main_id/note' });

            const result = await bubbleService.processNoteToOrder(main_id, note, req.app.get('io'));
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('[Bubble Webhook] Error in note_to_order:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new BubbleController();
