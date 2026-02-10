const express = require('express');
const router = express.Router();
const bubbleController = require('../controllers/bubbleController');
const { verifyWebhookToken } = require('../middleware/webhookAuth'); // Assume I'll create this or define inline if lazy. 
// Actually, let's keep it inline for now to avoid creating too many small files unless requested, 
// OR create middleware/webhookAuth.js. Creating middleware is cleaner.

// Middleware definition (if not external)
const verifyToken = (req, res, next) => {
  const token = req.headers['x-webhook-token'] || req.headers['authorization']?.replace('Bearer ', '');
  const expectedToken = process.env.BUBBLE_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('[Bubble Webhook] BUBBLE_WEBHOOK_SECRET not set');
    return res.status(500).json({ success: false, error: 'Webhook secret not configured' });
  }

  if (!token || token !== expectedToken) {
    console.warn(`[Bubble Webhook] Unauthorized access from ${req.ip}`);
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
};

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

router.post('/message', verifyToken, (req, res) => bubbleController.createMessage(req, res));
router.patch('/message/:id', verifyToken, (req, res) => bubbleController.updateMessage(req, res));

router.post('/order', verifyToken, (req, res) => bubbleController.createOrder(req, res));
router.post('/contact', verifyToken, (req, res) => bubbleController.createContact(req, res));

router.post('/status', verifyToken, (req, res) => bubbleController.updateStatus(req, res));

router.post('/note_to_user', verifyToken, (req, res) => bubbleController.noteToUser(req, res));
router.post('/note_to_order', verifyToken, (req, res) => bubbleController.noteToOrder(req, res));

module.exports = router;
