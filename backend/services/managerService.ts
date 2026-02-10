import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class ManagerService {
    async getAll() {
        const { data: managers, error } = await supabase
            .from('managers')
            .select('id, name, email, role, created_at, username')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return managers;
    }

    async create(data: { email: string; password?: string; name: string; role?: string }) {
        const { email, password, name, role } = data;

        if (!email || !password || !name) {
            throw new Error('Email, name and password are required');
        }

        const { data: existing } = await supabase
            .from('managers')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existing) {
            throw new Error('User with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: manager, error } = await supabase
            .from('managers')
            .insert({
                email,
                password_hash: hashedPassword,
                name,
                username: email,
                role: role || 'operator'
            })
            .select('id, name, email, role, created_at')
            .single();

        if (error) throw error;
        return manager;
    }

    async update(id: string, data: { name?: string; role?: string; password?: string }) {
        const { name, role, password } = data;
        const updates: any = {};

        if (name) updates.name = name;
        if (role) updates.role = role;
        if (password) {
            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters');
            }
            updates.password_hash = await bcrypt.hash(password, 10);
        }

        if (Object.keys(updates).length === 0) {
            throw new Error('No fields to update');
        }

        const { data: manager, error } = await supabase
            .from('managers')
            .update(updates)
            .eq('id', id)
            .select('id, name, email, role, created_at')
            .single();

        if (error) throw error;
        return manager;
    }

    async delete(id: string, currentManagerId: number) {
        if (parseInt(id) === currentManagerId) {
            throw new Error('Cannot delete yourself');
        }

        const { error } = await supabase
            .from('managers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return { success: true };
    }

    async updateNotificationSettings(managerId: number, settings: any) {
        if (!settings) {
            throw new Error('Settings are required');
        }

        const { data, error } = await supabase
            .from('managers')
            .update({ notification_settings: settings })
            .eq('id', managerId)
            .select('notification_settings')
            .single();

        if (error) throw error;
        return data;
    }
}

export default new ManagerService();
