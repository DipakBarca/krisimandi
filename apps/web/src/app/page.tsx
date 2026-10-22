'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { ListingCard } from '@/components/ListingCard';
import { ListingMap } from '@/components/ListingMap';
import { api, ApiError } from '@/lib/api';
import { useCrops, useMunicipalities } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { ListingPage, ListingResult } from '@/lib/types';

const SORTS = ['newest', 'price_asc', 'price_desc', 'nearest', 'ending_soon'] as const;
const RADII = [5, 10, 25, 50];
const FILTER_KEYS = ['q', 'cropId', 'saleMode', 'municipalityId', 'minPrice', 'maxPrice', 'sort', 'radiusKm'] as const;
type Point = { lat: number; lng: number };

export default function BrowsePage() {
  return (
    <Suspense>
      <Browse />
    </Suspense>
  );
}

function Browse() {
  const { t, tError, name, num } = useI18n();
  const crops = useCrops();
  const municipalities = useMunicipalities();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the address bar so a search can be shared or reopened.
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])), [params]) as Record<
    (typeof FILTER_KEYS)[number],
    string
  >;
  const view = params.get('view') === 'map' ? 'map' : 'list';
  const setParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  // The buyer's position is kept for this visit only, never put in the address bar.
  const [here, setHere] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const [text, setText] = useState(filters.q);
  const [items, setItems] = useState<ListingResult[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(filters.q), [filters.q]);
  useEffect(() => {
    if (text === filters.q) return;
    const timer = setTimeout(() => setParams({ q: text.trim() || null }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      if (!filters[k]) continue;
      if ((k === 'radiusKm' || (k === 'sort' && filters.sort === 'nearest')) && !here) continue;
      q.set(k, filters[k]);
    }
    if (here) {
      q.set('lat', String(here.lat));
      q.set('lng', String(here.lng));
    }
    q.set('limit', view === 'map' ? '50' : '20');
    return q.toString();
  }, [filters, here, view]);

  const load = async (after?: string) => {
    setError(null);
    try {
      const page = await api<ListingPage>(`/listings?${query}${after ? `&cursor=${after}` : ''}`);
      setItems((prev) => (after ? [...(prev ?? []), ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      if (!after) setItems([]);
    }
  };

  useEffect(() => {
    setItems(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const nearMe = () => {
    if (here) {
      setHere(null);
      setParams({ radiusKm: null, sort: filters.sort === 'nearest' ? null : filters.sort });
      return;
    }
    setGpsError(false);
    setLocating(true);
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setParams({ sort: 'nearest', radiusKm: filters.radiusKm || '25' });
      },
      () => {
        setLocating(false);
        setGpsError(true);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  // Text, sort and the nearby radius have their own controls, so they don't count as hidden filters.
  const activeFilters = FILTER_KEYS.filter((k) => !['q', 'sort', 'radiusKm'].includes(k) && filters[k]).length;
  const crop = crops.find((c) => String(c.id) === filters.cropId);
  const alertHref = crop
    ? `/alerts?${new URLSearchParams({
        cropId: String(crop.id),
        ...(filters.municipalityId ? { municipalityId: filters.municipalityId } : {}),
        ...(filters.maxPrice ? { maxPrice: filters.maxPrice } : {}),
      })}`
    : null;

  return (
    <div className="stack">
      <h1>{t('browse.title')}</h1>

      <div className="search-bar">
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          maxLength={60}
        />
        <select value={filters.cropId} onChange={(e) => setParams({ cropId: e.target.value })} aria-label={t('form.crop')}>
          <option value="">{t('browse.allCrops')}</option>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </select>
      </div>

      <div className="row wrap">
        <button type="button" className={here ? '' : 'secondary'} onClick={nearMe} disabled={locating} aria-pressed={!!here}>
          📍 {locating ? t('search.locating') : here ? t('search.nearOff') : t('search.nearMe')}
        </button>
        {here && (
          <select value={filters.radiusKm} onChange={(e) => setParams({ radiusKm: e.target.value })} aria-label={t('search.anyDistance')} className="auto">
            {RADII.map((km) => (
              <option key={km} value={km}>
                {t('search.radius', { km: num(km) })}
              </option>
            ))}
            <option value="">{t('search.anyDistance')}</option>
          </select>
        )}
        <div className="toggle" role="group">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} type="button" className={view === v ? '' : 'secondary'} aria-pressed={view === v} onClick={() => setParams({ view: v === 'map' ? 'map' : null })}>
              {t(v === 'map' ? 'search.map' : 'search.list')}
            </button>
          ))}
        </div>
      </div>
      {gpsError && <p className="error">{t('search.gpsDenied')}</p>}

      <details className="filters" open={activeFilters > 0 || undefined}>
        <summary>
          {t('search.filters')}
          {activeFilters > 0 && <span className="badge">{num(activeFilters)}</span>}
        </summary>
        <div className="stack">
          <div className="row">
            <Field label={t('search.saleMode')}>
              <select value={filters.saleMode} onChange={(e) => setParams({ saleMode: e.target.value })}>
                <option value="">{t('search.anyMode')}</option>
                <option value="FIXED">{t('listing.fixed')}</option>
                <option value="AUCTION">{t('listing.auction')}</option>
              </select>
            </Field>
            <Field label={t('location.municipality')}>
              <select value={filters.municipalityId} onChange={(e) => setParams({ municipalityId: e.target.value })}>
                <option value="">{t('search.anywhere')}</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>
                    {name(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="row">
            <Field label={t('search.minPrice')}>
              <PriceInput value={filters.minPrice} onCommit={(v) => setParams({ minPrice: v })} />
            </Field>
            <Field label={t('search.maxPrice')}>
              <PriceInput value={filters.maxPrice} onCommit={(v) => setParams({ maxPrice: v })} />
            </Field>
          </div>
          {activeFilters > 0 && (
            <p>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setHere(null);
                  setParams(Object.fromEntries(FILTER_KEYS.filter((k) => k !== 'q').map((k) => [k, null])));
                }}
              >
                {t('search.clear')}
              </button>
            </p>
          )}
        </div>
      </details>

      <div className="row between">
        <span className="muted small">{items && items.length > 0 && t('search.count', { n: num(items.length) + (cursor ? '+' : '') })}</span>
        <select
          value={filters.sort || 'newest'}
          onChange={(e) => setParams({ sort: e.target.value === 'newest' ? null : e.target.value })}
          aria-label={t('search.sort')}
          className="auto"
        >
          {SORTS.filter((s) => s !== 'nearest' || here).map((s) => (
            <option key={s} value={s}>
              {t(`search.sort.${s}`)}
            </option>
          ))}
        </select>
      </div>

      <ErrorText message={error} />
      {items === null ? (
        <p className="muted">{t('common.loading')}</p>
      ) : view === 'map' ? (
        <ListingMap items={items} here={here} />
      ) : items.length === 0 ? (
        <p className="muted">{FILTER_KEYS.some((k) => filters[k]) || here ? t('search.noMatch') : t('browse.empty')}</p>
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
      {alertHref && crop && (
        <p className="notice">
          🔔 <Link href={alertHref}>{t('search.alertCta', { crop: name(crop) })}</Link>
        </p>
      )}
    </div>
  );
}

/** Number box that only updates the search when the buyer leaves it or presses Enter. */
function PriceInput({ value, onCommit }: { value: string; onCommit: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft && Number(draft) >= 0 ? String(Number(draft)) : null);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}
