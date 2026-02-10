const express = require('express');
const router = express.Router();
const bubbleController = require('../controllers/bubbleController');
const { verifyWebhookToken } = require('../middleware/webhookAuth');

// Logging middleware
router.use((req, res, next) => {
  console.log(`[Bubble Webhook] ${req.method} ${req.path}`, {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    hasToken: !!(req.headers['x-webhook-token'] || req.headers['authorization'])
  });
  next();
});

router.get('/', bubbleController.test);

router.post('/message', verifyWebhookToken, (req, res) => bubbleController.createMessage(req, res));
router.patch('/message/:id', verifyWebhookToken, (req, res) => bubbleController.updateMessage(req, res));

router.post('/order', verifyWebhookToken, (req, res) => bubbleController.createOrder(req, res));
router.post('/contact', verifyWebhookToken, (req, res) => bubbleController.createContact(req, res));

router.post('/status', verifyWebhookToken, (req, res) => bubbleController.updateStatus(req, res));

router.post('/note_to_user', verifyWebhookToken, (req, res) => bubbleController.noteToUser(req, res));
router.post('/note_to_order', verifyWebhookToken, (req, res) => bubbleController.noteToOrder(req, res));

module.exports = router;
