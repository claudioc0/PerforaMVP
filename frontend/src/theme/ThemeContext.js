import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors } from './colors';

const THEME_MODE_KEY = 'theme_mode'; // 'light' | 'dark', persistido em AsyncStorage

const ThemeContext = createContext(null);

/** Provider do tema claro/escuro — fica fora do UserProvider em App.js, já
 * que a escolha de tema não depende de estar logado. Só renderiza os
 * filhos depois de ler o AsyncStorage (`ready`), pra não piscar o tema
 * padrão por um frame antes da preferência salva ser aplicada. */
export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark'); // default: mantém a experiência atual pra quem nunca escolheu
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark') setMode(saved);
      })
      .finally(() => setReady(true));
  }, []);

  const setThemeMode = useCallback((newMode) => {
    setMode(newMode);
    // Falha ao persistir não deve travar a troca em si — só não sobrevive a um restart do app.
    AsyncStorage.setItem(THEME_MODE_KEY, newMode).catch(() => {});
  }, []);

  const colors = mode === 'light' ? lightColors : darkColors;
  const value = useMemo(() => ({ mode, colors, setThemeMode }), [mode, colors, setThemeMode]);

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme precisa ser usado dentro de um ThemeProvider');
  }
  return ctx;
}
