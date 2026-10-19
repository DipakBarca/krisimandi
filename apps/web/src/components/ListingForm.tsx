'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useCrops, useUnits } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Listing, Me } from '@/lib/types';
import { ErrorText, Field } from './Field';
import { LocationPicker } from './LocationPicker';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const optional = (s: string) => (s.trim() ? s.trim() : undefined);
const optionalNumber = (s: string) => (s ? Number(s) : undefined);

/** Create a listing, or edit one (crop, unit and sale mode are fixed after posting). */
export function ListingForm({ me, listing, onDone }: { me: Me; listing?: Listing; onDone: (l: Listing) => void }) {
  const { t, tError, name } = useI18n();
  const crops = useCrops();
  const units = useUnits();
  const editing = Boolean(listing);

  const [cropId, setCropId] = useState(listing?.crop.id ?? 0);
  const [unitId, setUnitId] = useState(listing?.unit.id ?? 0);
  const [variety, setVariety] = useState(listing?.variety ?? '');
  const [grade, setGrade] = useState(listing?.grade ?? '');
  const [quantity, setQuantity] = useState(listing?.quantity ?? '');
  const [saleMode, setSaleMode] = useState<'FIXED' | 'AUCTION'>(listing?.saleMode ?? 'FIXED');
  const [price, setPrice] = useState(listing?.pricePerUnit ?? '');
  const [startPrice, setStartPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [harvestDate, setHarvestDate] = useState(listing?.harvestDate.slice(0, 10) ?? today());
  const [availableUntil, setAvailableUntil] = useState(listing?.availableUntil.slice(0, 10) ?? inDays(7));
  const [description, setDescription] = useState(listing?.description ?? '');
  const [location, setLocation] = useState<{ wardId: number | null; village: string; lat?: number; lng?: number }>({
    wardId: listing?.ward.id ?? me.wardId,
    village: listing?.village ?? me.village ?? '',
    ...(listing?.location && !listing.location.approximate ? { lat: listing.location.lat, lng: listing.location.lng } : {}),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picking a crop picks its usual unit.
  useEffect(() => {
    if (editing) return;
    const crop = crops.find((c) => c.id === cropId);
    if (crop) setUnitId(crop.defaultUnitId);
  }, [cropId, crops, editing]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const shared = {
      variety: optional(variety),
      grade: optional(grade),
      description: optional(description),
      quantity: Number(quantity),
      availableUntil,
      wardId: location.wardId ?? undefined,
      village: optional(location.village),
      lat: location.lat,
      lng: location.lng,
    };
    try {
      const saved = editing
        ? await api<Listing>(`/listings/${listing!.id}`, {
            method: 'PATCH',
            body: { ...shared, pricePerUnit: saleMode === 'FIXED' ? optionalNumber(price) : undefined },
          })
        : await api<Listing>('/listings', {
            body: {
              ...shared,
              cropId,
              unitId,
              saleMode,
              harvestDate,
              ...(saleMode === 'FIXED'
                ? { pricePerUnit: optionalNumber(price) }
                : {
                    auction: {
                      startPrice: Number(startPrice),
                      reservePrice: optionalNumber(reservePrice),
                      minIncrement: Number(minIncrement),
                      endsAt: endsAt ? new Date(endsAt).toISOString() : '',
                    },
                  }),
            },
          });
      onDone(saved);
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <Field label={t('form.crop')}>
        <select value={cropId || ''} onChange={(e) => setCropId(Number(e.target.value))} disabled={editing} required>
          <option value="">{t('location.choose')}</option>
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {name(c)}
            </option>
          ))}
        </select>
      </Field>
      <div className="row">
        <Field label={t('form.variety')}>
          <input value={variety} onChange={(e) => setVariety(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t('form.grade')}>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={30} />
        </Field>
      </div>
      <div className="row">
        <Field label={t('form.quantity')}>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </Field>
        <Field label={t('form.unit')}>
          <select value={unitId || ''} onChange={(e) => setUnitId(Number(e.target.value))} disabled={editing} required>
            <option value="">{t('location.choose')}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {name(u)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!editing && (
        <fieldset className="field">
          <legend className="field-label">{t('form.saleMode')}</legend>
          <label className="check">
            <input type="radio" name="mode" checked={saleMode === 'FIXED'} onChange={() => setSaleMode('FIXED')} />
            <span>
              {t('listing.fixed')} <span className="muted small">{t('form.fixedHint')}</span>
            </span>
          </label>
          <label className="check">
            <input type="radio" name="mode" checked={saleMode === 'AUCTION'} onChange={() => setSaleMode('AUCTION')} />
            <span>
              {t('listing.auction')} <span className="muted small">{t('form.auctionHint')}</span>
            </span>
          </label>
        </fieldset>
      )}

      {saleMode === 'FIXED' ? (
        <Field label={t('form.price')}>
          <input type="number" inputMode="decimal" min="1" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
      ) : (
        !editing && (
          <>
            <div className="row">
              <Field label={t('form.startPrice')}>
                <input type="number" inputMode="decimal" min="1" step="0.01" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} required />
              </Field>
              <Field label={t('form.minIncrement')}>
                <input type="number" inputMode="decimal" min="1" step="0.01" value={minIncrement} onChange={(e) => setMinIncrement(e.target.value)} required />
              </Field>
            </div>
            <Field label={t('form.reservePrice')}>
              <input type="number" inputMode="decimal" min="1" step="0.01" value={reservePrice} onChange={(e) => setReservePrice(e.target.value)} />
            </Field>
            <Field label={t('form.endsAt')}>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
            </Field>
          </>
        )
      )}

      <div className="row">
        <Field label={t('form.harvestDate')}>
          <input type="date" value={harvestDate} onChange={(e) => setHarvestDate(e.target.value)} disabled={editing} required />
        </Field>
        <Field label={t('form.availableUntil')}>
          <input type="date" value={availableUntil} min={today()} onChange={(e) => setAvailableUntil(e.target.value)} required />
        </Field>
      </div>

      <LocationPicker value={location} onChange={setLocation} initialMunicipalityId={listing?.ward.municipalityId ?? me.ward?.municipalityId} withGps />

      <Field label={t('form.description')}>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
      </Field>

      <ErrorText message={error} />
      <button disabled={busy}>{busy ? t('common.saving') : t(editing ? 'form.saveChanges' : 'form.submit')}</button>
    </form>
  );
}
