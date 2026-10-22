'use client';

import { useEffect, useState } from 'react';
import { useApi, useMunicipalities } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Ward } from '@/lib/types';
import { Field } from './Field';

type Value = { wardId: number | null; village: string; lat?: number; lng?: number };

/** Municipality → ward → village, with an optional GPS pin. */
export function LocationPicker({
  value,
  onChange,
  initialMunicipalityId,
  withGps,
}: {
  value: Value;
  onChange: (v: Value) => void;
  initialMunicipalityId?: number;
  withGps?: boolean;
}) {
  const { t, name, num } = useI18n();
  const municipalities = useMunicipalities();
  const [municipalityId, setMunicipalityId] = useState<number | null>(initialMunicipalityId ?? null);
  const wards = useApi<Ward[]>(municipalityId ? `/locations/municipalities/${municipalityId}/wards` : null).data ?? [];
  const [gpsError, setGpsError] = useState(false);

  useEffect(() => {
    if (initialMunicipalityId) setMunicipalityId(initialMunicipalityId);
  }, [initialMunicipalityId]);

  const useGps = () => {
    setGpsError(false);
    navigator.geolocation?.getCurrentPosition(
      (pos) => onChange({ ...value, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <>
      <Field label={t('location.municipality')}>
        <select
          value={municipalityId ?? ''}
          onChange={(e) => {
            setMunicipalityId(Number(e.target.value) || null);
            onChange({ ...value, wardId: null });
          }}
          required
        >
          <option value="">{t('location.choose')}</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {name(m)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('location.ward')}>
        <select
          value={value.wardId ?? ''}
          onChange={(e) => onChange({ ...value, wardId: Number(e.target.value) || null })}
          disabled={!wards.length}
          required
        >
          <option value="">{t('location.choose')}</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {num(w.wardNo)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('location.village')}>
        <input value={value.village} onChange={(e) => onChange({ ...value, village: e.target.value })} maxLength={80} />
      </Field>
      {withGps && (
        <p>
          <button type="button" className="secondary" onClick={useGps}>
            {t('location.useGps')}
          </button>{' '}
          {value.lat !== undefined && <span className="muted">✓ {t('location.gpsSet')}</span>}
          {gpsError && <span className="error">{t('error.generic')}</span>}
        </p>
      )}
    </>
  );
}
