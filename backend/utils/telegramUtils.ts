/**
 * Utility functions for Telegram Bot API interactions
 */
import axios from 'axios';

/**
 * Escapes special characters for MarkdownV2 formatting in Telegram.
 * Telegram requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param text - The text to escape
 * @returns The escaped text
 */
export function escapeMarkdownV2(text: string | null | undefined): string | null | undefined {
    if (!text) return text;

    // Telegram MarkdownV2 special characters that need escaping
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

    let escaped = String(text);
    specialChars.forEach(char => {
        // Simple string replacement for all occurrences (split/join is safer than regex without escaping regex chars)
        escaped = escaped.split(char).join('\\' + char);
    });

    return escaped;
}

/**
 * Sends a message to a user via Telegram Bot API
 */
export async function sendMessageToUser(telegramUserId: string | number, message: string, options: any = {}) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!TELEGRAM_BOT_TOKEN) {
        console.error('TELEGRAM_BOT_TOKEN не установлен');
        return { success: false, messageId: null };
    }

    try {
        const requestBody = {
            chat_id: telegramUserId,
            text: message,
            // parse_mode is not default anymore to avoid errors
            ...options
        };

        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, requestBody);
        const messageId = response.data?.result?.message_id || null;
        return { success: true, messageId };
    } catch (error: any) {
        console.error('Error sending message via bot:', error.response?.data || error.message);

        // Retry without formatting if parse error
        if (options.parse_mode && error.response?.data?.description?.includes('parse')) {
            try {
                console.log('[sendMessageToUser] Retrying without formatting...');
                const retryResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: telegramUserId,
                    text: message
                });
                const messageId = retryResponse.data?.result?.message_id || null;
                return { success: true, messageId };
            } catch (retryError: any) {
                console.error('Error sending message without formatting:', retryError.message);
            }
        }
        return { success: false, messageId: null };
    }
}
