import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class NoteService {
    async getByContact(contactId: string) {
        let targetContactId = contactId;

        // Resolve Telegram ID
        const { data: contactResolve } = await supabase
            .from('contacts')
            .select('id')
            .eq('telegram_user_id', contactId)
            .maybeSingle();

        if (contactResolve) {
            targetContactId = contactResolve.id;
        }

        const { data, error } = await supabase
            .from('notes')
            .select(`
                *,
                manager:managers!notes_manager_id_fkey(name)
            `)
            .eq('contact_id', targetContactId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getByOrder(orderId: string) {
        let internalOrderId: string | number = orderId;

        // Check if orderId is a main_id
        if (/^\d{10,}$/.test(orderId)) {
            const { data: order } = await supabase
                .from('orders')
                .select('id')
                .eq('main_id', orderId)
                .single();

            if (order) {
                internalOrderId = order.id;
            } else {
                return [];
            }
        }

        const { data, error } = await supabase
            .from('notes')
            .select(`
                *,
                manager:managers!notes_manager_id_fkey(name)
            `)
            .eq('order_id', internalOrderId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async create(data: { contact_id?: string; order_id?: string; content: string; priority?: string }, manager: any) {
        const { contact_id, order_id, content, priority } = data;

        const { data: note, error } = await supabase
            .from('notes')
            .insert({
                contact_id,
                order_id,
                content,
                priority: priority || 'info',
                manager_id: manager.id,
            })
            .select(`
                *,
                manager:managers!notes_manager_id_fkey(name)
            `)
            .single();

        if (error) throw error;

        // VEG-64: Create system message if note is for an order
        if (order_id) {
            try {
                const managerName = manager.name || manager.email;
                const now = new Date();
                const timestamp = now.toLocaleString('ru-RU', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }).replace(',', '');

                const shortContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
                const systemContent = `📝 ${managerName} создал заметку: "${shortContent}" ${timestamp}`;

                await supabase
                    .from('internal_messages')
                    .insert({
                        order_id: order_id,
                        sender_id: manager.id,
                        content: systemContent,
                        is_read: false,
                        attachment_type: 'system'
                    });

            } catch (e) {
                console.error('Error creating system message for note:', e);
            }
        }

        return note;
    }

    async update(id: string, updateData: any, managerId: string | number) {
        const { data, error } = await supabase
            .from('notes')
            .update(updateData)
            .eq('id', id)
            .eq('manager_id', managerId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async delete(id: string, managerId: string | number) {
        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', id)
            .eq('manager_id', managerId);

        if (error) throw error;
        return { success: true };
    }
}

export default new NoteService();
