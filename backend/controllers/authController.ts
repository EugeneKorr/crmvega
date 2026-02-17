import { Request, Response } from 'express';
import authService from '../services/authService';

class AuthController {
    async register(req: Request, res: Response) {
        try {
            const result = await authService.register(req.body);
            res.json(result);
        } catch (error: any) {
            console.error('Registration error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async login(req: Request, res: Response) {
        try {
            const result = await authService.login(req.body);
            res.json(result);
        } catch (error: any) {
            console.error('Login error:', error);
            // Return 401 for login failures if possible, or valid error handling
            // The service throws generic error, but we want to stick to what was there.
            // In JS: res.status(401).json({ error: 'Неверный email или пароль' });
            // Here error.message might be 'Неверный email или пароль'
            if (error.message === 'Неверный email или пароль') {
                res.status(401).json({ error: error.message });
            } else {
                res.status(400).json({ error: error.message });
            }
        }
    }

    async forgotPassword(req: Request, res: Response) {
        try {
            const result = await authService.requestPasswordReset(req.body.email);
            if (result.success) {
                res.json(result);
            } else {
                // Should not happen based on service logic returning success: true or throwing
                res.json(result);
            }
        } catch (error: any) {
            console.error('Forgot password error:', error);
            res.status(500).json({ error: 'Ошибка сервера' });
        }
    }

    async resetPassword(req: Request, res: Response) {
        try {
            const result = await authService.resetPassword(req.body);
            res.json(result);
        } catch (error: any) {
            console.error('Reset password error:', error);
            if (error.message === 'Недействительная или использованная ссылка' || error.message.includes('ссылка')) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        }
    }

    // TEMPORARY: Quick login without password
    async quickLogin(req: Request, res: Response) {
        try {
            const result = await authService.quickLogin();
            res.json(result);
        } catch (error: any) {
            console.error('Quick login error:', error);
            res.status(400).json({ error: error.message });
        }
    }

    async verifyResetToken(req: Request, res: Response) {
        try {
            const { token } = req.params;
            const result = await authService.verifyResetToken(token as string);
            res.json(result);
        } catch (error: any) {
            console.error('Verify token error:', error);
            res.status(400).json({ valid: false, error: error.message });
        }
    }
}

export default new AuthController();
