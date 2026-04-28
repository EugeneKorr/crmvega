import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ClientProfile } from '../utils/clientProfile';

interface ClientProfileContextType {
  getProfile: (telegramId: string | number | undefined | null) => ClientProfile | null;
  isLoaded: boolean;
}

const ClientProfileContext = createContext<ClientProfileContextType>({
  getProfile: () => null,
  isLoaded: false,
});

export const ClientProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profileMap, setProfileMap] = useState<Map<string, ClientProfile>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('telegram_id, state, animal_name, animal_emoji, adjective, risk_flag, risk_flag_reasons, deal_count')
        .not('state', 'is', null);

      if (error) {
        console.warn('ClientProfileContext: не удалось загрузить профили', error);
        setIsLoaded(true);
        return;
      }

      const map = new Map<string, ClientProfile>();
      for (const row of data ?? []) {
        map.set(String(row.telegram_id), row as ClientProfile);
      }
      setProfileMap(map);
      setIsLoaded(true);
    })();
  }, []);

  const getProfile = useCallback(
    (telegramId: string | number | undefined | null): ClientProfile | null => {
      if (telegramId == null || telegramId === '') return null;
      return profileMap.get(String(telegramId)) ?? null;
    },
    [profileMap],
  );

  return (
    <ClientProfileContext.Provider value={{ getProfile, isLoaded }}>
      {children}
    </ClientProfileContext.Provider>
  );
};

export const useClientProfiles = () => useContext(ClientProfileContext);
