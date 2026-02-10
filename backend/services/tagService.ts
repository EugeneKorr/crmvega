import { createClient } from '@supabase/supabase-js';
import { clearCache } from '../utils/cache';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class TagService {
    async getSettings() {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            const disabled = data?.value || false;
            return { disable_user_tag_creation: disabled };
        } catch (error) {
            console.error('Error fetching tag settings:', error);
            return { disable_user_tag_creation: false };
        }
    }

    async updateSettings(disabled: boolean) {
        const { data, error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'disable_user_tag_creation',
                value: disabled,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    async getAll() {
        const { data: tags, error: tagsError } = await supabase
            .from('tags')
            .select('*')
            .order('name');

        if (tagsError) throw tagsError;
        if (!tags) return [];

        const { data: allLinks, error: linksError } = await supabase
            .from('order_tags')
            .select('tag_id');

        const counts: Record<string, number> = {};
        if (!linksError && allLinks) {
            allLinks.forEach(l => {
                counts[l.tag_id] = (counts[l.tag_id] || 0) + 1;
            });
        }

        return tags.map(t => ({
            ...t,
            count: counts[t.id] || 0
        }));
    }

    async create(data: { name: string; color?: string }, manager: any) {
        if (manager.role !== 'admin') {
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                throw new Error('Создание тегов запрещено администратором');
            }
        }

        const { data: tag, error } = await supabase
            .from('tags')
            .insert(data)
            .select()
            .single();

        if (error) throw error;
        clearCache('orders');
        return tag;
    }

    async update(id: string, data: { name?: string; color?: string }, manager: any) {
        if (manager.role !== 'admin') {
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                throw new Error('Редактирование тегов запрещено администратором');
            }
        }

        const { data: tag, error } = await supabase
            .from('tags')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        clearCache('orders');
        return tag;
    }

    async delete(id: string, manager: any) {
        if (manager.role !== 'admin') {
            const { data: setting } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'disable_user_tag_creation')
                .single();

            if (setting?.value === true) {
                throw new Error('Удаление тегов запрещено администратором');
            }
        }

        const { error } = await supabase
            .from('tags')
            .delete()
            .eq('id', id);

        if (error) throw error;
        clearCache('orders');
        return { success: true };
    }

    async assignToOrder(orderId: string, tagId: string, manager: any) {
        const { data: tag } = await supabase
            .from('tags')
            .select('name')
            .eq('id', tagId)
            .single();

        const { data, error } = await supabase
            .from('order_tags')
            .insert({ order_id: orderId, tag_id: tagId })
            .select();

        if (error) {
            if (error.code === '23505') {
                return { success: true, message: 'Tag already assigned' };
            }
            throw error;
        }

        if (tag && data && data.length > 0) {
            try {
                const managerName = manager.name || manager.email;
                const now = new Date();
                const timestamp = now.toLocaleString('ru-RU', {
                    year: '2-digit', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                }).replace(',', '');

                const systemContent = `🏷️ ${managerName} добавил тег "${tag.name}" ${timestamp}`;

                await supabase
                    .from('internal_messages')
                    .insert({
                        order_id: orderId,
                        sender_id: manager.id,
                        content: systemContent,
                        is_read: false,
                        attachment_type: 'system'
                    });

            } catch (e) {
                console.error('Error creating system message for tag assignment:', e);
            }
        }

        clearCache('orders');
        return data;
    }

    async removeFromOrder(orderId: string, tagId: string, manager: any) {
        const { data: tag } = await supabase
            .from('tags')
            .select('name')
            .eq('id', tagId)
            .single();

        const { error } = await supabase
            .from('order_tags')
            .delete()
            .eq('order_id', orderId)
            .eq('tag_id', tagId);

        if (error) throw error;

        if (tag) {
            try {
                const managerName = manager.name || manager.email;
                const now = new Date();
                const timestamp = now.toLocaleString('ru-RU', {
                    year: '2-digit', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                }).replace(',', '');

                const systemContent = `🏷️ ${managerName} удалил тег "${tag.name}" ${timestamp}`;

                await supabase
                    .from('internal_messages')
                    .insert({
                        order_id: orderId,
                        sender_id: manager.id,
                        content: systemContent,
                        is_read: false,
                        attachment_type: 'system'
                    });

            } catch (e) {
                console.error('Error creating system message for tag removal:', e);
            }
        }

        clearCache('orders');
        return { success: true };
    }

    async getByOrder(orderId: string) {
        const { data, error } = await supabase
            .from('order_tags')
            .select('tag:tags(*)')
            .eq('order_id', orderId);

        if (error) throw error;
        if (!data) return [];

        return data.map((item: any) => item.tag).filter(Boolean);
    }
}

export default new TagService();
