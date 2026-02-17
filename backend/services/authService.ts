import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use service role for admin tasks like user creation if needed, though anon key was used in JS. JS used anon key?
    // In JS: process.env.SUPABASE_ANON_KEY.
    // However, creating managers usually requires higher privilege if RLS is on.
    // But the JS code used SUPABASE_ANON_KEY. I will stick to it unless it fails.
    // Wait, let's use what was in JS.
);

// Re-init with anon key for consistency with JS code, or safer service role if we want to be robust.
// JS used: process.env.SUPABASE_ANON_KEY.
const supabaseAnon = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class AuthService {
    async register(data: { email: string; password: string; name: string }) {
        const { email, password, name } = data;
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: manager, error } = await supabaseAnon
            .from('managers')
            .insert({
                email,
                password_hash: hashedPassword,
                name,
                username: email,
                role: 'operator'
            })
            .select()
            .single();

        if (error) throw error;

        const token = jwt.sign(
            { id: manager.id, email: manager.email, name: manager.name, role: manager.role || 'operator' },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        return { token, manager };
    }

    async login(data: { email: string; password: string }) {
        const { email, password } = data;

        const { data: manager, error } = await supabaseAnon
            .from('managers')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !manager) {
            throw new Error('Неверный email или пароль');
        }

        const validPassword = await bcrypt.compare(password, manager.password_hash || manager.password);
        if (!validPassword) {
            throw new Error('Неверный email или пароль');
        }

        const token = jwt.sign(
            { id: manager.id, email: manager.email, name: manager.name, role: manager.role || 'operator' },
            process.env.JWT_SECRET || 'secret',
            { expiresIn: '24h' }
        );

        return {
            token,
            manager: {
                id: manager.id,
                email: manager.email,
                name: manager.name,
                role: manager.role || 'operator'
            }
        };
    }

    async requestPasswordReset(email: string) {
        if (!email) throw new Error('Email обязателен');

        const { data: manager, error: findError } = await supabaseAnon
            .from('managers')
            .select('id, email, name')
            .eq('email', email)
            .single();

        if (findError || !manager) {
            return { success: true, message: 'Если email зарегистрирован, вы получите письмо' };
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        // Delete old tokens (using service role might be better here but anon key was used)
        await supabaseAnon
            .from('password_reset_tokens')
            .delete()
            .eq('manager_id', manager.id);

        const { error: insertError } = await supabaseAnon
            .from('password_reset_tokens')
            .insert({
                manager_id: manager.id,
                email: manager.email,
                token,
                expires_at: expiresAt.toISOString()
            });

        if (insertError) throw insertError;

        const resetUrl = `${process.env.FRONTEND_URL || 'https://crmvega.vercel.app'}/reset-password?token=${token}`;

        // Send email via Edge Function
        try {
            const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-reset-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    to: manager.email,
                    name: manager.name || 'Пользователь',
                    resetUrl
                })
            });

            if (!response.ok) {
                console.error('Email send failed:', await response.text());
            }
        } catch (emailError) {
            console.error('Failed to send reset email:', emailError);
        }

        console.log(`[Password Reset] Token created for ${email}. Reset URL: ${resetUrl}`);
        return { success: true, message: 'Инструкции отправлены на email' };
    }

    async resetPassword(data: { token: string; password: string }) {
        const { token, password } = data;

        if (!token || !password) throw new Error('Токен и пароль обязательны');
        if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов');

        const { data: resetToken, error: findError } = await supabaseAnon
            .from('password_reset_tokens')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .single();

        if (findError || !resetToken) {
            throw new Error('Недействительная или использованная ссылка');
        }

        if (new Date(resetToken.expires_at) < new Date()) {
            throw new Error('Ссылка истекла. Запросите новую.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const { error: updateError } = await supabaseAnon
            .from('managers')
            .update({ password_hash: hashedPassword })
            .eq('id', resetToken.manager_id);

        if (updateError) throw updateError;

        await supabaseAnon
            .from('password_reset_tokens')
            .update({ used: true })
            .eq('id', resetToken.id);

        return { success: true, message: 'Пароль успешно изменён' };
    }

    async verifyResetToken(token: string) {
        const { data: resetToken, error } = await supabaseAnon
            .from('password_reset_tokens')
            .select('email, expires_at, used')
            .eq('token', token)
            .single();

        if (error || !resetToken) {
            throw new Error('Недействительная ссылка');
        }

        if (resetToken.used) {
            throw new Error('Ссылка уже использована');
        }

        if (new Date(resetToken.expires_at) < new Date()) {
            throw new Error('Ссылка истекла');
        }

        return { valid: true, email: resetToken.email };
    }
}

export default new AuthService();
