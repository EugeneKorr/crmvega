import express from 'express';
import bubbleController from '../controllers/bubbleController';
import { verifyWebhookToken } from '../middleware/webhookAuth';

const router = express.Router();

// Logging middleware
router.use((req, res, next) => {
    console.log(`[Bubble Webhook] ${req.method} ${req.path}`, {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        hasToken: !!(req.headers['x-webhook-token'] || req.headers['authorization'])
    });
    next();
});

router.get('/', (req, res) => bubbleController.test(req, res));

router.post('/message', verifyWebhookToken, (req, res) => bubbleController.createMessage(req, res));
router.patch('/message/:id', verifyWebhookToken, (req, res) => bubbleController.updateMessage(req, res));

router.post('/order', verifyWebhookToken, (req, res) => bubbleController.createOrder(req, res));
router.post('/contact', verifyWebhookToken, (req, res) => bubbleController.createContact(req, res));

router.post('/status', verifyWebhookToken, (req, res) => bubbleController.updateStatus(req, res));

router.post('/note_to_user', verifyWebhookToken, (req, res) => bubbleController.noteToUser(req, res));
router.post('/note_to_order', verifyWebhookToken, (req, res) => bubbleController.noteToOrder(req, res));

export default router;
