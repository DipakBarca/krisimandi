'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const REFRESH_EVENT = 'krisimandi:counts';
/** Lets a page that reads notices or messages update the header badges straight away. */
export const notifyUnreadChanged = () => window.dispatchEvent(new Event(REFRESH_EVENT));

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { me } = useAuth();
  const pathname = usePathname();
  const { notices, messages } = useCounts(!!me?.profileComplete, pathname);
  return (
    <header className="header">
      <Link href="/" className="brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span>{t('app.name')}</span>
      </Link>
      <nav className="nav">
        <Link href="/">{t('nav.browse')}</Link>
        {me?.roles.includes('FARMER') && <Link href="/sell">{t('nav.sell')}</Link>}
        {me && <Link href="/deals">{t('nav.deals')}</Link>}
        {me && <Badged href="/messages" icon="💬" label={t('nav.messages')} count={messages} />}
        {me && <Badged href="/notifications" icon="🔔" label={t('nav.alerts')} count={notices} />}
        {me && <Badged href="/saved" icon="♥" label={t('nav.saved')} count={0} />}
        {me ? <Link href="/profile">{t('nav.profile')}</Link> : <Link href="/login">{t('nav.login')}</Link>}
        <button className="link" onClick={() => setLang(lang === 'ne' ? 'en' : 'ne')}>
          {t('lang.switch')}
        </button>
      </nav>
    </header>
  );
}

function Badged({ href, icon, label, count }: { href: string; icon: string; label: string; count: number }) {
  const { num } = useI18n();
  return (
    <Link href={href} className="bell" aria-label={count ? `${label} (${count})` : label} title={label}>
      {icon}
      {count > 0 && <span className="count">{num(Math.min(count, 99))}</span>}
    </Link>
  );
}

/** Unread notices and messages, refreshed on each page change, every 30 seconds and on demand. */
function useCounts(enabled: boolean, pathname: string) {
  const [counts, setCounts] = useState({ notices: 0, messages: 0 });
  useEffect(() => {
    if (!enabled) return setCounts({ notices: 0, messages: 0 });
    let live = true;
    const load = () =>
      Promise.all([
        api<{ unread: number }>('/me/notifications/unread'),
        api<{ unread: number }>('/me/conversations/unread'),
      ])
        .then(([n, m]) => live && setCounts({ notices: n.unread, messages: m.unread }))
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    window.addEventListener(REFRESH_EVENT, load);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, load);
    };
  }, [enabled, pathname]);
  return counts;
}
