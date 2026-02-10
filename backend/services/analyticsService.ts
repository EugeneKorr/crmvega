import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class AnalyticsService {
    async getOrdersAnalytics(startDate?: string, endDate?: string) {
        let ordersQuery = supabase.from('orders').select('*');

        if (startDate) {
            ordersQuery = ordersQuery.gte('created_at', startDate);
        }
        if (endDate) {
            ordersQuery = ordersQuery.lte('created_at', endDate);
        }

        const { data: orders, error } = await ordersQuery;

        if (error) throw error;

        // Statistics by status
        const statusStats: Record<string, { count: number; amount: number }> = {};
        let totalAmount = 0;
        let closedAmount = 0;

        orders?.forEach(order => {
            if (!statusStats[order.status]) {
                statusStats[order.status] = { count: 0, amount: 0 };
            }
            statusStats[order.status].count++;
            const amount = parseFloat(order.amount) || 0;
            statusStats[order.status].amount += amount;
            totalAmount += amount;
            if (order.status === 'closed') {
                closedAmount += amount;
            }
        });

        // Conversion funnel
        const funnel = {
            new: statusStats['new']?.count || 0,
            negotiation: statusStats['negotiation']?.count || 0,
            waiting: statusStats['waiting']?.count || 0,
            ready_to_close: statusStats['ready_to_close']?.count || 0,
            closed: statusStats['closed']?.count || 0,
            rejected: statusStats['rejected']?.count || 0,
        };

        // Sales by month
        const monthlySales: Record<string, number> = {};
        orders?.forEach(order => {
            if (order.status === 'closed') {
                const dateStr = order.closed_date || order.updated_at;
                if (dateStr) {
                    const month = new Date(dateStr).toISOString().slice(0, 7);
                    if (!monthlySales[month]) {
                        monthlySales[month] = 0;
                    }
                    monthlySales[month] += parseFloat(order.amount) || 0;
                }
            }
        });

        // Statistics by manager
        const { data: managersData } = await supabase
            .from('managers')
            .select('id, name');

        const managerStats: Record<string, { name: string; orders: number; closed: number; amount: number }> = {};
        managersData?.forEach(manager => {
            managerStats[manager.id] = {
                name: manager.name,
                orders: 0,
                closed: 0,
                amount: 0,
            };
        });

        orders?.forEach(order => {
            if (order.manager_id && managerStats[order.manager_id]) {
                managerStats[order.manager_id].orders++;
                const amount = parseFloat(order.amount) || 0;
                managerStats[order.manager_id].amount += amount;
                if (order.status === 'closed') {
                    managerStats[order.manager_id].closed++;
                }
            }
        });

        // Sources of orders
        const sourceStats: Record<string, { count: number; amount: number }> = {};
        orders?.forEach(order => {
            const source = order.source || 'Не указан';
            if (!sourceStats[source]) {
                sourceStats[source] = { count: 0, amount: 0 };
            }
            sourceStats[source].count++;
            sourceStats[source].amount += parseFloat(order.amount) || 0;
        });

        return {
            summary: {
                total: orders?.length || 0,
                totalAmount,
                closedAmount,
                closedCount: statusStats['closed']?.count || 0,
                conversionRate: orders && orders.length > 0
                    ? ((statusStats['closed']?.count || 0) / orders.length * 100).toFixed(1)
                    : 0,
            },
            statusStats,
            funnel,
            monthlySales: Object.entries(monthlySales)
                .map(([month, amount]) => ({ month, amount }))
                .sort((a, b) => a.month.localeCompare(b.month)),
            managerStats: Object.values(managerStats),
            sourceStats: Object.entries(sourceStats).map(([source, data]) => ({
                source,
                ...data,
            })),
        };
    }

    async getContactsAnalytics() {
        const { data: contacts, error } = await supabase
            .from('contacts')
            .select('id, status, created_at');

        if (error) throw error;

        const statusStats: Record<string, number> = {};
        const monthlyGrowth: Record<string, number> = {};

        contacts?.forEach(contact => {
            // Stats by status
            const status = contact.status || 'active';
            statusStats[status] = (statusStats[status] || 0) + 1;

            // Growth by month
            if (contact.created_at) {
                const month = new Date(contact.created_at).toISOString().slice(0, 7);
                monthlyGrowth[month] = (monthlyGrowth[month] || 0) + 1;
            }
        });

        return {
            total: contacts?.length || 0,
            statusStats,
            monthlyGrowth: Object.entries(monthlyGrowth)
                .map(([month, count]) => ({ month, count }))
                .sort((a, b) => a.month.localeCompare(b.month)),
        };
    }
}

export default new AnalyticsService();
