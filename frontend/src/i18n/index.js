import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import ptCommon from './locales/pt/common.json';
import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';

export const SUPPORTED_LANGUAGES = ['pt', 'en', 'es'];
export const DEFAULT_LANGUAGE = 'pt';

// Cada tela registra o próprio namespace via `registerNamespace` (ver
// LanguageContext.js) — este arquivo central só carrega o namespace
// "common" (compartilhado entre várias telas), pra não virar um ponto único
// que toda migração de tela precisaria editar.
i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  resources: {
    pt: { common: ptCommon },
    en: { common: enCommon },
    es: { common: esCommon },
  },
  interpolation: { escapeValue: false },
});

/** Registra um namespace de tradução por tela, uma vez só (idempotente —
 * `addResourceBundle` com `deep: true` sobrescreve sem duplicar se o mesmo
 * módulo for reimportado). Cada tela chama isso no topo do próprio arquivo,
 * passando os 3 JSONs (pt/en/es) que ela mesma importa — mantém a edição
 * isolada por tela, sem depender deste arquivo central. */
export function registerNamespace(namespace, { pt, en, es }) {
  i18n.addResourceBundle('pt', namespace, pt, true, true);
  i18n.addResourceBundle('en', namespace, en, true, true);
  i18n.addResourceBundle('es', namespace, es, true, true);
}

/** Mapeia o idioma configurado no aparelho pro mais próximo suportado —
 * qualquer idioma fora de pt/en/es cai no português (idioma nativo do app). */
export function resolveDeviceLanguage() {
  const code = Localization.getLocales()?.[0]?.languageCode;
  return SUPPORTED_LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

export default i18n;
