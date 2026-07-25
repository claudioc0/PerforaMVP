import React, { createContext, useContext, useState, useCallback } from 'react';

const DrawerMenuContext = createContext(null);

export function DrawerMenuProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <DrawerMenuContext.Provider value={{ isOpen, open, close }}>
      {children}
    </DrawerMenuContext.Provider>
  );
}

export function useDrawerMenu() {
  const context = useContext(DrawerMenuContext);
  if (!context) {
    throw new Error('useDrawerMenu precisa ser usado dentro de um DrawerMenuProvider');
  }
  return context;
}
