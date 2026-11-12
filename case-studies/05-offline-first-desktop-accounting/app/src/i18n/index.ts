import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import zh from './zh.json'

export type Lang = 'en' | 'zh'
const STORAGE_KEY = 'daybook.lang'

function savedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'zh') return v
  } catch {
    // storage blocked: fall through to the default
  }
  return 'en'
}

export function persistLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // not critical
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  lng: savedLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

document.documentElement.lang = i18n.language === 'zh' ? 'zh-Hans' : 'en'
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng === 'zh' ? 'zh-Hans' : 'en'
})

export default i18n
