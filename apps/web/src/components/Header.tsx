'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { me } = useAuth();
  return (
    <header className="header">
      <Link href="/" className="brand">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span>{t('app.name')}</span>
      </Link>
      <nav className="nav">
        <Link href="/">{t('nav.browse')}</Link>
        {me?.roles.includes('FARMER') && <Link href="/sell">{t('nav.sell')}</Link>}
        {me ? <Link href="/profile">{t('nav.profile')}</Link> : <Link href="/login">{t('nav.login')}</Link>}
        <button className="link" onClick={() => setLang(lang === 'ne' ? 'en' : 'ne')}>
          {t('lang.switch')}
        </button>
      </nav>
    </header>
  );
}
