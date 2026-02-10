import { Request, Response } from 'express';
import bubbleService from '../services/bubbleService';
import { notifyErrorSubscribers } from '../utils/notifyError';

class BubbleController {

    async test(req: Request, res: Response) {
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

    async createMessage(req: Request, res: Response) {
        try {
            console.log('[Bubble Webhook] POST /message', JSON.stringify(req.body, null, 2));
            const result = await bubbleService.processMessage(req.body);
            res.json({ success: true, data: result });
        } catch (error: any) {
            console.error('Error creating message from Bubble:', error);
            notifyErrorSubscribers(`🔴 Ошибка обработки сообщения из Bubble:\n${error.message}`);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateMessage(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await bubbleService.updateMessage(id as string, req.body);
            res.json({ success: true, data: result });
        } catch (error: any) {
            console.error('Error updating message from Bubble:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async createOrder(req: Request, res: Response) {
        try {
            const result = await bubbleService.processOrder(req.body);
            console.log(`[Bubble Webhook] Created order ${result.id}`);
            res.json({ success: true, data: result });
        } catch (error: any) {
            console.error('Error creating order from Bubble:', error);
            notifyErrorSubscribers(`🔴 Ошибка создания заявки из Bubble:\n${error.message}`);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async createContact(req: Request, res: Response) {
        try {
            console.log('[Bubble Webhook] contact:', JSON.stringify(req.body, null, 2));
            const result = await bubbleService.processContact(req.body);
            res.json({ success: true, data: result.data, action: result.action });
        } catch (error: any) {
            console.error('Error processing contact:', error);
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async updateStatus(req: Request, res: Response) {
        try {
            // processStatusUpdate expects { leads: { status: [...] } } or similar structure?
            // Service check: if (!leads || !leads.status ...)
            // So if we pass req.body.leads, then req.body must look like { leads: { status: [...] } }
            // If the webhook sends { status: [...] } directly inside leads property?
            // The JS code did `req.body.leads`, so I'll trust that.
            const result = await bubbleService.processStatusUpdate(req.body.leads);
            res.json({ success: true, ...result });
        } catch (error: any) {
            console.error('Error processing status update:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async noteToUser(req: Request, res: Response) {
        try {
            const { user, note } = req.body;
            if (!user || !note) return res.status(400).json({ success: false, error: 'Missing user/note' });

            const result = await bubbleService.processNoteToUser(user, note);
            res.json({ success: true, ...result });
        } catch (error: any) {
            console.error('[Bubble Webhook] Error in note_to_user:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async noteToOrder(req: Request, res: Response) {
        try {
            const { main_id, note } = req.body;
            if (!main_id || !note) return res.status(400).json({ success: false, error: 'Missing main_id/note' });

            const result = await bubbleService.processNoteToOrder(main_id, note);
            res.json({ success: true, ...result });
        } catch (error: any) {
            console.error('[Bubble Webhook] Error in note_to_order:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

export default new BubbleController();
