import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from '@shared/i18n'
import type { Language } from '@shared/types'

void i18next.use(initReactI18next).init({
  resources: { ko: { translation: resources.ko }, en: { translation: resources.en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setLanguage(lang: Language): void {
  if (i18next.language !== lang) void i18next.changeLanguage(lang)
  document.documentElement.lang = lang
}

export default i18next
