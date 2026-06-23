import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './locales/en/common.json';
import ko from './locales/ko/common.json';

const resources = {
  en: { translation: en },
  ko: { translation: ko },
};

// Get device locale, fallback to 'en'
const getDeviceLocale = (): string => {
  const locale = Localization.getLocales()[0]?.languageCode;
  return locale && Object.keys(resources).includes(locale) ? locale : 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLocale(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
});

export default i18n;

// Export supported languages for settings
export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]['code'];

// Helper to change language
export const changeLanguage = async (languageCode: SupportedLanguage) => {
  await i18n.changeLanguage(languageCode);
};
