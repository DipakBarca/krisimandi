'use client';

import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { api, ApiError } from '@/lib/api';
import { useApi, useCrops, useMunicipalities, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { CropAlert } from '@/lib/types';

export default function AlertsPage() {
  return (
    <Suspense>
      <Alerts />
    </Suspense>
  );
}

function Alerts() {
  const { t, tError, name, num } = useI18n();
  const me = useRequireProfile();
  const params = useSearchParams();
  const crops = useCrops();
  const municipalities = useMunicipalities();
  const { data: alerts, setData } = useApi<CropAlert[]>(me ? '/me/alerts' : null);
  // The market page links here with its current crop, place and price filled in.
  const [cropId, setCropId] = useState(params.get('cropId') ?? '');
  const [municipalityId, setMunicipalityId] = useState(params.get('municipalityId') ?? '');
  const [maxPrice, setMaxPrice] = useState(params.get('maxPrice') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setAdded(false);
    try {
      const alert = await api<CropAlert>('/me/alerts', {
        body: {
          cropId: Number(cropId),
          ...(municipalityId ? { municipalityId: Number(municipalityId) } : {}),
          ...(maxPrice ? { maxPrice: Number(maxPrice) } : {}),
        },
      });
      setData([alert, ...(alerts ?? []).filter((a) => a.id !== alert.id)]);
      setAdded(true);
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api(`/me/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    setData((alerts ?? []).filter((a) => a.id !== id));
  };

  return (
    <div className="stack narrow">
      <h1>{t('alerts.title')}</h1>
      <p className="muted">{t('alerts.hint')}</p>

      <form className="stack notice" onSubmit={add}>
        <Field label={t('alerts.crop')}>
          <select value={cropId} onChange={(e) => setCropId(e.target.value)} required>
            <option value="">{t('location.choose')}</option>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('alerts.municipality')}>
          <select value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)}>
            <option value="">{t('search.anywhere')}</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>
                {name(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('alerts.maxPrice')}>
          <input type="number" inputMode="decimal" min={1} step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        </Field>
        <ErrorText message={error} />
        {added && <p className="muted">✓ {t('alerts.added')}</p>}
        <button disabled={busy || !cropId}>{busy ? t('common.saving') : t('alerts.add')}</button>
      </form>

      {!alerts ? (
        <p className="muted">{t('common.loading')}</p>
      ) : alerts.length === 0 ? (
        <p className="muted">{t('alerts.empty')}</p>
      ) : (
        <ul className="plain-list">
          {alerts.map((a) => (
            <li key={a.id} className="row between">
              <span>
                <b>{name(a.crop)}</b>
                <span className="muted">
                  {' · '}
                  {a.municipality ? name(a.municipality) : t('search.anywhere')}
                  {a.maxPrice && ` · ${t('alerts.under', { price: num(a.maxPrice) })}`}
                </span>
              </span>
              <button className="link" onClick={() => remove(a.id)}>
                {t('alerts.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
