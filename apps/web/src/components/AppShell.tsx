'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISSED = 'krisimandi.installDismissed';

/** Registers the service worker and offers "add to home screen" where the phone supports it. */
export function InstallBanner() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISSED) === '1';
      } catch {}
      if (!dismissed) setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!prompt) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {}
    setPrompt(null);
  };
  return (
    <div className="install row between" role="region" aria-label={t('install.title')}>
      <span>
        <b>{t('install.title')}</b>
        <br />
        <span className="small">{t('install.body')}</span>
      </span>
      <span className="row">
        <button onClick={async () => { await prompt.prompt(); setPrompt(null); }}>{t('install.add')}</button>
        <button className="link small" onClick={dismiss} aria-label={t('install.later')}>
          ✕
        </button>
      </span>
    </div>
  );
}

export function Footer() {
  const { t } = useI18n();
  const phone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
  return (
    <footer className="footer">
      <nav className="row wrap">
        <Link href="/help">{t('footer.help')}</Link>
        <Link href="/terms">{t('footer.terms')}</Link>
        <Link href="/privacy">{t('footer.privacy')}</Link>
      </nav>
      {phone && (
        <p className="small muted">
          {t('footer.support')}: <a href={`tel:${phone}`}>{phone}</a>
        </p>
      )}
      <p className="small muted">{t('footer.pilot')}</p>
    </footer>
  );
}
