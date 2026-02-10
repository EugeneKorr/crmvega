import { Request, Response, NextFunction } from 'express';

export const verifyWebhookToken = (req: Request, res: Response, next: NextFunction) => {
    // Get token from x-webhook-token OR Authorization Bearer
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;

    // Handle array of strings case for headers just in case (though unlikely for these specific headers)
    const webhookTokenHeader = req.headers['x-webhook-token'];
    const webhookToken = Array.isArray(webhookTokenHeader) ? webhookTokenHeader[0] : webhookTokenHeader;

    const token = webhookToken || bearerToken;
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
