'use client';

import { ListingCard } from '@/components/ListingCard';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { ListingResult } from '@/lib/types';

export default function SavedPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const { data, setData } = useApi<ListingResult[]>(me ? '/me/saved' : null);

  return (
    <>
      <h1>{t('saved.title')}</h1>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="muted">{t('saved.empty')}</p>
      ) : (
        <div className="grid">
          {data.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onSavedChange={(saved) => !saved && setData(data.filter((x) => x.id !== l.id))}
            />
          ))}
        </div>
      )}
    </>
  );
}
