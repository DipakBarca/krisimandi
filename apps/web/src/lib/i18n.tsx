'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Lang, MessageKey, messages } from './messages';

const NE_DIGITS = '०१२३४५६७८९';
export const toNepaliDigits = (s: string) => s.replace(/\d/g, (d) => NE_DIGITS[Number(d)]);

const MONTHS = {
  ne: ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Translates an API error code, falling back to a generic message. */
  tError: (code?: string) => string;
  /** Localized name from a record with nameNe / nameEn. */
  name: (r: { nameNe: string; nameEn: string } | null | undefined) => string;
  num: (n: number | string) => string;
  /** AD date, e.g. "19 अक्टोबर 2026". Browsers lack Nepali date formats, so this is built by hand. */
  date: (iso: string, withTime?: boolean) => string;
};

const I18nContext = createContext<I18n | null>(null);
const STORAGE_KEY = 'krisimandi.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ne');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'ne' || saved === 'en') setLangState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const num = useCallback(
    (n: number | string) => {
      const s = Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      return lang === 'ne' ? toNepaliDigits(s) : s;
    },
    [lang],
  );

  const date = useCallback(
    (iso: string, withTime = false) => {
      const d = new Date(iso);
      // Date-only values are stored as UTC midnight; times are shown in the viewer's time zone.
      const [day, month, year] = withTime
        ? [d.getDate(), d.getMonth(), d.getFullYear()]
        : [d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear()];
      let text = `${day} ${MONTHS[lang].at(month)} ${year}`;
      if (withTime) text += `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return lang === 'ne' ? toNepaliDigits(text) : text;
    },
    [lang],
  );

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let text: string = messages[lang][key] ?? messages.en[key] ?? key;
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replaceAll(`{${k}}`, String(v));
      return text;
    },
    [lang],
  );

  const tError = useCallback(
    (code?: string) => {
      const key = `error.${code}` as MessageKey;
      return code && key in messages[lang] ? t(key) : t('error.generic');
    },
    [lang, t],
  );

  const name = useCallback(
    (r: { nameNe: string; nameEn: string } | null | undefined) => (r ? (lang === 'ne' ? r.nameNe : r.nameEn) : ''),
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t, tError, name, num, date }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
