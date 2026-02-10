import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Функция для логирования ошибок в таблицу logs
export async function logError(
    source: string,
    message: string,
    details: Record<string, any> = {},
    level: 'error' | 'info' | 'warning' = 'error'
): Promise<void> {
    try {
        const { error } = await supabase
            .from('logs')
            .insert({
                source: source, // e.g., 'telegram_bot', 'order_messages'
                message: message,
                details: details, // JSON object
                level: level, // 'error', 'info', 'warning'
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('[Logger] Failed to write log to DB:', error);
        } // else succeeded
    } catch (err) {
        console.error('[Logger] Unexpected error writing log:', err);
    }
}
