import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar } from './ar';
import { en } from './en';
import type { LanguageCode } from '../shared/types';

export function getInitialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem('clinicflow_lang');
    if (saved === 'en' || saved === 'ar-EG') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'ar-EG';
}

export function applyDocumentLanguage(lang: LanguageCode): void {
  const isAr = lang.startsWith('ar');
  document.documentElement.lang = isAr ? 'ar-EG' : 'en';
  document.documentElement.dir = isAr ? 'rtl' : 'ltr';
  try {
    localStorage.setItem('clinicflow_lang', lang);
  } catch {
    // Ignore storage errors
  }
}

const initialLang = getInitialLanguage();
if (typeof document !== 'undefined') {
  applyDocumentLanguage(initialLang);
}

i18n.use(initReactI18next).init({
  resources: {
    'ar-EG': { translation: ar },
    en: { translation: en },
  },
  lng: initialLang,
  fallbackLng: 'ar-EG',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
