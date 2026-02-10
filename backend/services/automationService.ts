import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class AutomationService {
    async getAutomations(isActive?: boolean) {
        let query = supabase
            .from('automations')
            .select(`
                *,
                manager:managers!automations_manager_id_fkey(name)
            `)
            .order('created_at', { ascending: false });

        if (isActive !== undefined) {
            query = query.eq('is_active', isActive);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data;
    }

    async getAutomation(id: string | number) {
        const { data, error } = await supabase
            .from('automations')
            .select(`
                *,
                manager:managers!automations_manager_id_fkey(name)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createAutomation(data: any, managerId: string | number) {
        const {
            name,
            description,
            trigger_type,
            trigger_conditions,
            action_type,
            action_config,
            is_active = true,
        } = data;

        const { data: automation, error } = await supabase
            .from('automations')
            .insert({
                name,
                description,
                trigger_type,
                trigger_conditions: trigger_conditions || {},
                action_type,
                action_config,
                is_active,
                manager_id: managerId,
            })
            .select()
            .single();

        if (error) throw error;
        return automation;
    }

    async updateAutomation(id: string | number, data: any) {
        const { data: automation, error } = await supabase
            .from('automations')
            .update(data)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return automation;
    }

    async deleteAutomation(id: string | number) {
        const { error } = await supabase
            .from('automations')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }

    async executeAutomation(id: string | number, entityType: string, entityId: string | number) {
        const { data: automation, error } = await supabase
            .from('automations')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (!automation.is_active) {
            throw new Error('Automation is not active');
        }

        // Logic for execution would go here
        return { success: true, message: 'Automation executed' };
    }
}

export default new AutomationService();
