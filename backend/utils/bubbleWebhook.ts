import axios from 'axios';
import { ORDER_STATUSES, StatusDefinition } from './statuses';

// Обратный маппинг: внутренний статус -> Bubble status_id
export const STATUS_TO_BUBBLE_ID: Record<string, string> = Object.entries(ORDER_STATUSES).reduce((acc, [key, value]) => {
    const statusDef = value as StatusDefinition;
    if (statusDef.bubble_id) {
        acc[key] = statusDef.bubble_id;
    }
    return acc;
}, {} as Record<string, string>);

interface BubbleWebhookParams {
    mainId: string | number;
    newStatus: string;
    oldStatus: string;
    retries?: number;
}

interface WebhookResult {
    success: boolean;
    error?: string;
    response?: any;
    details?: any;
}

/**
 * Отправляет вебхук на Bubble при изменении статуса заявки
 */
export async function sendBubbleStatusWebhook({ mainId, newStatus, oldStatus, retries = 3 }: BubbleWebhookParams): Promise<WebhookResult> {
    const webhookUrl = 'https://vegaexchanges.bubbleapps.io/version-live/api/1.1/wf/wh_order2/';

    // Получаем Bubble ID для статусов
    const newStatusId = STATUS_TO_BUBBLE_ID[newStatus];
    const oldStatusId = STATUS_TO_BUBBLE_ID[oldStatus];

    // Если статус не найден в маппинге, логируем предупреждение
    if (!newStatusId) {
        console.warn(`[Bubble Webhook] Unknown status mapping for: ${newStatus}`);
        return { success: false, error: 'Unknown status mapping' };
    }

    // Формируем payload
    const payload = {
        leads: {
            status: [
                {
                    id: String(mainId),
                    status_id: newStatusId,
                    old_status_id: oldStatusId || newStatusId, // Если старого нет, используем новый
                    last_modified: String(Math.floor(Date.now() / 1000)) // Unix timestamp в секундах
                }
            ]
        }
    };

    console.log('[Bubble Webhook] Sending status change:', {
        mainId,
        oldStatus: `${oldStatus} (${oldStatusId})`,
        newStatus: `${newStatus} (${newStatusId})`,
        timestamp: new Date().toISOString(),
        payload
    });

    // Попытки отправки с повторами
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 секунд таймаут
            });

            console.log(`[Bubble Webhook] ✅ Success (attempt ${attempt}/${retries}):`, {
                mainId,
                status: response.status,
                data: response.data
            });

            return { success: true, response: response.data };

        } catch (error: any) {
            const isLastAttempt = attempt === retries;

            console.error(`[Bubble Webhook] ❌ Error (attempt ${attempt}/${retries}):`, {
                mainId,
                error: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            if (isLastAttempt) {
                console.error(`[Bubble Webhook] Failed after ${retries} attempts for main_id: ${mainId}`);
                return {
                    success: false,
                    error: error.message,
                    details: error.response?.data
                };
            }

            // Ждем перед следующей попыткой (экспоненциальная задержка)
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // max 5 секунд
            console.log(`[Bubble Webhook] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return { success: false, error: 'Max retries exceeded' };
}

// Обратный маппинг: Bubble status_id -> внутренний статус
export const BUBBLE_ID_TO_STATUS: Record<string, string> = Object.entries(STATUS_TO_BUBBLE_ID).reduce((acc, [key, value]) => {
    acc[value] = key;
    return acc;
}, {} as Record<string, string>);
