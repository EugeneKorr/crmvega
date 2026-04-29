import React, { createContext, useContext, useEffect, useState } from 'react';

interface DesignContextType {
  useNewDesign: boolean;
  toggleDesign: () => void;
}

const DesignContext = createContext<DesignContextType>({
  useNewDesign: false,
  toggleDesign: () => {},
});

export const DesignProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [useNewDesign, setUseNewDesign] = useState(false);

  useEffect(() => {
    // Проверить query param ?newDesign=1
    const params = new URLSearchParams(window.location.search);
    const newDesignParam = params.get('newDesign') === '1';

    // Проверить localStorage для сохранения выбора
    const savedDesign = localStorage.getItem('crm_use_new_design') === 'true';

    setUseNewDesign(newDesignParam || savedDesign);
  }, []);

  const toggleDesign = () => {
    const newValue = !useNewDesign;
    setUseNewDesign(newValue);
    localStorage.setItem('crm_use_new_design', String(newValue));

    // Обновить URL без перезагрузки
    const url = new URL(window.location.href);
    if (newValue) {
      url.searchParams.set('newDesign', '1');
    } else {
      url.searchParams.delete('newDesign');
    }
    window.history.replaceState({}, '', url);
  };

  return (
    <DesignContext.Provider value={{ useNewDesign, toggleDesign }}>
      {children}
    </DesignContext.Provider>
  );
};

export const useDesign = () => useContext(DesignContext);
