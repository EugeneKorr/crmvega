import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Расширяем интерфейс Request для добавления свойства manager
// Это можно было сделать через d.ts, но тут проще сделать inline для модульности
declare global {
    namespace Express {
        interface Request {
            manager?: jwt.JwtPayload | string;
        }
    }
}

export const auth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        console.log(`[Auth] ${req.method} ${req.path} - Token: ${token ? 'present' : 'missing'}`);

        if (!token) {
            console.log('[Auth] No token provided');
            return res.status(401).json({ error: 'Требуется авторизация' });
        }

        if (!process.env.JWT_SECRET) {
            console.error('[Auth] JWT_SECRET is not set!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.manager = decoded;

        // Type guard for JwtPayload to safely access properties
        if (typeof decoded !== 'string') {
            console.log(`[Auth] Authenticated: ${decoded.email || decoded.id} (role: ${decoded.role || 'unknown'})`);
        } else {
            console.log(`[Auth] Authenticated: ${decoded}`);
        }

        next();
    } catch (error: any) {
        console.error('[Auth] Token verification failed:', error.message);
        res.status(401).json({ error: 'Неверный токен авторизации' });
    }
};

// Middleware для проверки роли админа
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.manager) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    // Check if manager is object and has role
    if (typeof req.manager === 'string' || (req.manager as any).role !== 'admin') {
        // Safe access for logging
        const role = typeof req.manager === 'object' ? (req.manager as any).role : 'unknown';
        console.log(`[Auth] Admin required, but user role is: ${role}`);
        return res.status(403).json({ error: 'Требуются права администратора' });
    }

    next();
};

export default auth;
