import express from 'express';
import botController from '../controllers/botController';

const router = express.Router();

// Webhook endpoint для Telegram бота
router.post('/webhook', (req, res) => botController.webhook(req, res));

router.get('/webhook', (req, res) => botController.testWebhook(req, res));

export default router;
