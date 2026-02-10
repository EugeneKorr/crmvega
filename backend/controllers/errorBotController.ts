import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class ErrorBotController {
    async handleWebhook(req: Request, res: Response) {
        try {
            const update = req.body;
            res.json({ ok: true });

            if (!update.message || !update.message.chat) return;

            const chat = update.message.chat;
            const text = update.message.text || '';
            const userId = chat.id;

            if (text.startsWith('/start')) {
                const { error } = await supabase
                    .from('error_subscribers')
                    .upsert({
                        chat_id: String(userId),
                        first_name: chat.first_name || 'Admin',
                        username: chat.username || null,
                        created_at: new Date().toISOString()
                    });

                if (error) {
                    console.error('[ErrorBot Webhook] Failed to save subscriber:', error);
                } else {
                    console.log(`[ErrorBot Webhook] New subscriber: ${userId}`);
                    const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN;
                    if (ERROR_BOT_TOKEN) {
                        await axios.post(`https://api.telegram.org/bot${ERROR_BOT_TOKEN}/sendMessage`, {
                            chat_id: userId,
                            text: `✅ Подписка оформлена!\nТеперь вы будете получать уведомления о критических ошибках CRM (например, сбои при создании заявок).\n\nВаш ID: ${userId}`
                        }).catch(err => console.error('[ErrorBot Webhook] Reply error:', err.message));
                    }
                }
            }
        } catch (err) {
            console.error('[ErrorBot Webhook] Critical error:', err);
        }
    }

    async setupWebhook(req: Request, res: Response) {
        const ERROR_BOT_TOKEN = process.env.ERROR_BOT_TOKEN;
        const WEBHOOK_URL = req.query.url as string;

        if (!ERROR_BOT_TOKEN || !WEBHOOK_URL) {
            return res.status(400).send('Missing token or url query param');
        }

        try {
            const response = await axios.post(`https://api.telegram.org/bot${ERROR_BOT_TOKEN}/setWebhook`, {
                url: `${WEBHOOK_URL}/api/error-bot/webhook`
            });
            res.send(response.data);
        } catch (err: any) {
            res.status(500).send(err.message);
        }
    }
}

export default new ErrorBotController();
