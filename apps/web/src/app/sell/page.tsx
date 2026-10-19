'use client';

import Link from 'next/link';
import { ListingCard } from '@/components/ListingCard';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Listing } from '@/lib/types';

export default function MyListingsPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const isFarmer = me?.roles.includes('FARMER');
  const { data } = useApi<Listing[]>(isFarmer ? '/me/listings' : null);

  if (!me) return <p className="muted">{t('common.loading')}</p>;
  if (!isFarmer) return <p>{t('sell.needFarmer')}</p>;
  return (
    <>
      <div className="row between">
        <h1>{t('sell.title')}</h1>
        <Link href="/sell/new" className="button">
          + {t('sell.new')}
        </Link>
      </div>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="muted">{t('sell.empty')}</p>
      ) : (
        <div className="grid">
          {data.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </>
  );
}
