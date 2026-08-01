import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { SUPPORTED_LANGUAGES, resolveDeviceLanguage } from './index';

// 'auto' | 'pt' | 'en' | 'es' — 'auto' segue o idioma do aparelho (e
// continua seguindo se o idioma do sistema mudar, já que é resolvido de
// novo a cada leitura, nunca fixado). Persistido separado de `language`
// (o idioma ATIVO já resolvido) porque a UI do seletor precisa saber se o
// usuário escolheu "Automático" mesmo quando isso resolve pro mesmo idioma
// que uma escolha manual resolveria.
const LANGUAGE_PREFERENCE_KEY = 'app_language';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [preference, setPreference] = useState('auto');
  const [language, setLanguageState] = useState(i18n.language);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY)
      .then((saved) => {
        const pref = saved === 'auto' || SUPPORTED_LANGUAGES.includes(saved) ? saved : 'auto';
        const resolved = pref === 'auto' ? resolveDeviceLanguage() : pref;
        i18n.changeLanguage(resolved);
        setPreference(pref);
        setLanguageState(resolved);
      })
      .finally(() => setReady(true));
  }, []);

  const setLanguage = useCallback((choice) => {
    const resolved = choice === 'auto' ? resolveDeviceLanguage() : choice;
    i18n.changeLanguage(resolved);
    setPreference(choice);
    setLanguageState(resolved);
    // Falha ao persistir não deve travar a troca em si — só não sobrevive a um restart do app.
    AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, choice).catch(() => {});
  }, []);

  const value = useMemo(() => ({ preference, language, setLanguage }), [preference, language, setLanguage]);

  if (!ready) return null;

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage precisa ser usado dentro de um LanguageProvider');
  }
  return ctx;
}
