'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const UNREAD_EVENT = 'krisimandi:unread';
/** Lets a page that marks notifications read update the bell straight away. */
export const notifyUnreadChanged = (unread: number) =>
  window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: unread }));

export function Header() {
  const { t, lang, setLang, num } = useI18n();
  const { me } = useAuth();
  const pathname = usePathname();
  const unread = useUnread(!!me?.profileComplete, pathname);
  return (
    <header className="header">
      <Link href="/" className="brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span>{t('app.name')}</span>
      </Link>
      <nav className="nav">
        <Link href="/">{t('nav.browse')}</Link>
        {me?.roles.includes('FARMER') && <Link href="/sell">{t('nav.sell')}</Link>}
        {me && <Link href="/saved">{t('nav.saved')}</Link>}
        {me && (
          <Link href="/notifications" className="bell" aria-label={`${t('nav.alerts')}${unread ? ` (${unread})` : ''}`}>
            🔔{unread > 0 && <span className="count">{num(unread > 99 ? 99 : unread)}</span>}
          </Link>
        )}
        {me ? <Link href="/profile">{t('nav.profile')}</Link> : <Link href="/login">{t('nav.login')}</Link>}
        <button className="link" onClick={() => setLang(lang === 'ne' ? 'en' : 'ne')}>
          {t('lang.switch')}
        </button>
      </nav>
    </header>
  );
}

/** Unread notification count, refreshed on each page change and every minute. */
function useUnread(enabled: boolean, pathname: string) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!enabled) return setUnread(0);
    let live = true;
    const load = () =>
      api<{ unread: number }>('/me/notifications/unread')
        .then((r) => live && setUnread(r.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    const onChange = (e: Event) => setUnread((e as CustomEvent<number>).detail);
    window.addEventListener(UNREAD_EVENT, onChange);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener(UNREAD_EVENT, onChange);
    };
  }, [enabled, pathname]);
  return unread;
}
