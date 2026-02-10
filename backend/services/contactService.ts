import { createClient } from '@supabase/supabase-js';
import { runAutomations } from './automationRunner';
import { clearCache } from '../utils/cache';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

interface ContactQueryParams {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
}

class ContactService {
    async getAll(params: ContactQueryParams) {
        const { search, status, limit = 50, offset = 0 } = params;

        let query = supabase
            .from('contacts')
            .select(`
                *,
                manager:managers!contacts_manager_id_fkey(name),
                tags:contact_tags(tag:tags(*))
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (status) {
            query = query.eq('status', status);
        }

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        if (!data) return { contacts: [] };

        // Get stats for orders for each contact
        const contactIds = data.map(c => c.id);
        const { data: ordersStats } = await supabase
            .from('orders')
            .select('contact_id, amount, status')
            .in('contact_id', contactIds);

        // Calculate stats
        const statsMap: Record<string, { count: number; total: number }> = {};
        ordersStats?.forEach(order => {
            if (!statsMap[order.contact_id]) {
                statsMap[order.contact_id] = { count: 0, total: 0 };
            }
            statsMap[order.contact_id].count++;
            if (order.amount) {
                statsMap[order.contact_id].total += parseFloat(order.amount);
            }
        });

        const contactsWithStats = data.map(contact => ({
            ...contact,
            orders_count: statsMap[contact.id]?.count || 0,
            orders_total_amount: statsMap[contact.id]?.total || 0,
            tags: (contact as any).tags?.map((t: any) => t.tag).filter(Boolean) || []
        }));

        return { contacts: contactsWithStats };
    }

    async getSummary(params: { limit?: number; offset?: number; search?: string }) {
        const { limit = 50, offset = 0, search } = params;
        const limitNum = Number(limit);
        const offsetNum = Number(offset);

        let query = supabase
            .from('contacts')
            .select('id, name, phone, telegram_user_id, telegram_username, first_name, last_name, last_message_at, avatar_url')
            .order('last_message_at', { ascending: false, nullsFirst: false })
            .range(offsetNum, offsetNum + limitNum - 1);

        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        let { data: contacts, error } = await query;

        if (error || !contacts) {
            console.error('Error fetching contacts summary:', error);
            // Fallback
            const fallbackQuery = supabase
                .from('contacts')
                .select('id, name, phone, telegram_user_id, last_message_at, avatar_url')
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .range(offsetNum, offsetNum + limitNum - 1);

            if (search) {
                fallbackQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
            }

            const { data: fallbackContacts, error: fallbackError } = await fallbackQuery;
            if (fallbackError) throw fallbackError;
            contacts = fallbackContacts as any[];
        }

        if (!contacts || contacts.length === 0) return [];

        const contactIds = contacts.map(c => c.id);
        const { data: allOrders } = await supabase
            .from('orders')
            .select('id, contact_id, main_id, created_at, status, manager:managers!deals_manager_id_fkey(name)')
            .in('contact_id', contactIds)
            .order('created_at', { ascending: false });

        const ordersByContact: Record<string, any[]> = {};
        allOrders?.forEach(order => {
            if (!ordersByContact[order.contact_id]) {
                ordersByContact[order.contact_id] = [];
            }
            ordersByContact[order.contact_id].push(order);
        });

        const allMainIds = [...new Set(allOrders?.map(o => o.main_id).filter(Boolean) || [])];

        const { data: allMessages } = await supabase
            .rpc('get_latest_messages', {
                target_main_ids: allMainIds.map(String),
                only_client: false
            });

        const lastMessageByMainId: Record<string, any> = {};
        allMessages?.forEach((msg: any) => {
            const mainId = String(msg.main_id);
            if (!lastMessageByMainId[mainId]) {
                lastMessageByMainId[mainId] = msg;
            }
        });

        const { data: unreadData } = await supabase
            .rpc('get_unread_client_counts', {
                target_main_ids: allMainIds.map(String)
            });

        const unreadMap: Record<string, number> = {};
        unreadData?.forEach((item: any) => {
            unreadMap[String(item.main_id)] = item.unread_count;
        });

        const contactsWithMessages = contacts.map(contact => {
            const orders = ordersByContact[contact.id] || [];
            const latestOrder = orders[0];

            let lastMessage = null;
            let lastMessageTime: number | null = null;

            orders.forEach(order => {
                const msg = lastMessageByMainId[String(order.main_id)];
                if (msg) {
                    const msgTime = new Date(msg['Created Date']).getTime();
                    if (!lastMessageTime || msgTime > lastMessageTime) {
                        lastMessage = msg;
                        lastMessageTime = msgTime;
                    }
                }
            });

            let displayName: string | null = null;
            if (contact.first_name || contact.last_name) {
                displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
            } else if (contact.telegram_username) {
                displayName = `@${contact.telegram_username}`;
            } else if (contact.name && !contact.name.startsWith('User ')) {
                displayName = contact.name;
            } else {
                displayName = `User ${contact.telegram_user_id}`;
            }

            return {
                ...contact,
                name: displayName,
                last_message: lastMessage,
                last_active: contact.last_message_at || lastMessage?.['Created Date'],
                latest_order_id: latestOrder?.id || null,
                latest_order_main_id: latestOrder?.main_id || null,
                last_order_status: latestOrder?.status,
                responsible_person: (latestOrder as any)?.manager?.name,
                unread_count: orders.reduce((sum, o) => sum + (unreadMap[String(o.main_id)] || 0), 0)
            };
        });

        return contactsWithMessages.sort((a, b) => {
            const tA = new Date(a.last_active || 0).getTime();
            const tB = new Date(b.last_active || 0).getTime();
            return tB - tA;
        });
    }

    async getById(id: string) {
        let query = supabase
            .from('contacts')
            .select(`
                *,
                manager:managers!contacts_manager_id_fkey(name),
                tags:contact_tags(tag:tags(*))
            `);

        if (/^\d{9,}$/.test(id)) {
            query = query.eq('telegram_user_id', id);
        } else {
            query = query.eq('id', id);
        }

        const { data: contact, error } = await query.single();
        if (error) throw error;
        if (!contact) return null;

        const { data: orders } = await supabase
            .from('orders')
            .select('id, OrderName, amount, status, created_at')
            .eq('contact_id', contact.id)
            .order('created_at', { ascending: false });

        contact.orders_count = orders?.length || 0;
        contact.orders_total_amount = orders?.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0) || 0;
        contact.tags = (contact as any).tags?.map((t: any) => t.tag).filter(Boolean) || [];

        return contact;
    }

    async create(data: any, managerId: string | number) {
        const { data: contact, error } = await supabase
            .from('contacts')
            .insert({
                ...data,
                status: data.status || 'active',
                manager_id: managerId,
            })
            .select()
            .single();

        if (error) throw error;

        return contact;
    }

    async update(id: string, updateData: any) {
        const { data, error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Run automations
        runAutomations('contact_created', data).catch(err => {
            console.error('Error running automations for contact_updated:', err);
        });

        return data;
    }

    async delete(id: string) {
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }

    async markMessagesRead(id: string) {
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('main_id')
            .eq('contact_id', id);

        if (ordersError) throw ordersError;

        const mainIds = orders?.map(o => o.main_id).filter(Boolean) || [];

        if (mainIds.length > 0) {
            await Promise.all(mainIds.map(main_id =>
                supabase.rpc('mark_messages_read', { p_main_id: String(main_id) })
            ));
        }

        clearCache('contacts');
        clearCache('orders');

        return { success: true, processed: mainIds.length };
    }
}

export default new ContactService();
