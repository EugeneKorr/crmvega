import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

class LogsController {
    async getLogs(req: Request, res: Response) {
        try {
            const {
                level,       // 'error' | 'warning' | 'info'
                source,      // e.g. 'telegram_bot', 'order_messages'
                search,      // поиск по message
                limit = '100',
                from,        // ISO timestamp
                to,          // ISO timestamp
            } = req.query;

            let query = supabase
                .from('logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(Math.min(Number(limit), 500));

            if (level) query = query.eq('level', level);
            if (source) query = query.eq('source', source);
            if (search) query = query.ilike('message', `%${search}%`);
            if (from) query = query.gte('created_at', from);
            if (to) query = query.lte('created_at', to);

            const { data, error, count } = await query;

            if (error) {
                console.error('[LogsController] Supabase error:', error);
                return res.status(500).json({ error: error.message });
            }

            res.json({ logs: data, count: data?.length ?? 0 });
        } catch (err: any) {
            console.error('[LogsController] Unexpected error:', err);
            res.status(500).json({ error: err.message });
        }
    }

    async getSources(req: Request, res: Response) {
        try {
            const { data, error } = await supabase
                .from('logs')
                .select('source')
                .order('source');

            if (error) return res.status(500).json({ error: error.message });

            const sources = [...new Set(data?.map(r => r.source).filter(Boolean))];
            res.json({ sources });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    }
}

export default new LogsController();
