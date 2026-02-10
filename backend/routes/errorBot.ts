import express from 'express';
import errorBotController from '../controllers/errorBotController';

const router = express.Router();

router.post('/webhook', express.json(), (req, res) => errorBotController.handleWebhook(req, res));
router.get('/setup-webhook', (req, res) => errorBotController.setupWebhook(req, res));

export default router;
