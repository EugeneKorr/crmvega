import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface PresenceState {
    user_id: string | number;
    name: string;
    online_at: string;
    viewing_order_id?: string | null;
}

interface PresenceContextType {
    onlineUsers: Record<string, PresenceState>;
    viewingOrder: (orderId: string | null) => void;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { manager } = useAuth();
    const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceState>>({});
    const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);

    useEffect(() => {
        if (!manager) return;

        // Создаем канал для отслеживания присутствия
        const channel = supabase.channel('global_presence', {
            config: {
                presence: {
                    key: manager.id.toString(),
                },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const newState = channel.presenceState();
                const formatted: Record<string, PresenceState> = {};

                Object.keys(newState).forEach((key) => {
                    const userPresence = newState[key] as any;
                    if (userPresence && userPresence.length > 0) {
                        formatted[key] = userPresence[userPresence.length - 1] as PresenceState;
                    }
                });

                setOnlineUsers(formatted);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        user_id: manager.id,
                        name: manager.name || manager.email,
                        online_at: new Date().toISOString(),
                        viewing_order_id: currentOrderId,
                    });
                }
            });

        return () => {
            channel.unsubscribe();
        };
    }, [manager, currentOrderId]);

    const viewingOrder = (orderId: string | null) => {
        setCurrentOrderId(orderId);
    };

    return (
        <PresenceContext.Provider value={{ onlineUsers, viewingOrder }}>
            {children}
        </PresenceContext.Provider>
    );
};

export const usePresence = () => {
    const context = useContext(PresenceContext);
    if (!context) throw new Error('usePresence must be used within PresenceProvider');
    return context;
};
