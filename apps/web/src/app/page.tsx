'use client';

import { useEffect, useState } from 'react';
import { ListingCard } from '@/components/ListingCard';
import { api } from '@/lib/api';
import { useCrops } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Listing } from '@/lib/types';

type Page = { items: Listing[]; nextCursor: string | null };

export default function BrowsePage() {
  const { t, name } = useI18n();
  const crops = useCrops();
  const [cropId, setCropId] = useState('');
  const [items, setItems] = useState<Listing[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const load = async (after?: string) => {
    const q = new URLSearchParams();
    if (cropId) q.set('cropId', cropId);
    if (after) q.set('cursor', after);
    const page = await api<Page>(`/listings?${q}`);
    setItems((prev) => (after ? [...(prev ?? []), ...page.items] : page.items));
    setCursor(page.nextCursor);
  };

  useEffect(() => {
    setItems(null);
    load().catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropId]);

  return (
    <>
      <div className="row between">
        <h1>{t('browse.title')}</h1>
        <select value={cropId} onChange={(e) => setCropId(e.target.value)} aria-label={t('form.crop')}>
          <option value="">{t('browse.allCrops')}</option>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </select>
      </div>
      {items === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="muted">{t('browse.empty')}</p>
      ) : (
        <div className="grid">
          {items.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
      {cursor && (
        <p>
          <button className="secondary" onClick={() => load(cursor)}>
            {t('browse.more')}
          </button>
        </p>
      )}
    </>
  );
}
