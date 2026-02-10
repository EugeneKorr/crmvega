const verifyWebhookToken = (req, res, next) => {
    const token = req.headers['x-webhook-token'] || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].replace('Bearer ', '') : req.headers['authorization']);
    const expectedToken = process.env.BUBBLE_WEBHOOK_SECRET;

    if (!expectedToken) {
        console.error('[Bubble Webhook] BUBBLE_WEBHOOK_SECRET not set');
        // For security, maybe just 401/403, but 500 signals misconfig internally logic
        return res.status(500).json({ success: false, error: 'Webhook secret not configured' });
    }

    if (!token || token !== expectedToken) {
        console.warn(`[Bubble Webhook] Unauthorized access from ${req.ip}`);
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    next();
};

module.exports = { verifyWebhookToken };
