'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Listing, Offer } from '@/lib/types';
import { ErrorText, Field } from './Field';

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/**
 * Offers on a fixed-price listing. The farmer sees every buyer's thread; a buyer sees their own
 * and, when nothing of theirs is open, a form to make a new offer.
 */
export function OfferPanel({ listing, isOwner }: { listing: Listing; isOwner: boolean }) {
  const { t, name } = useI18n();
  const { data: offers, refresh } = useApi<Offer[]>(`/listings/${listing.id}/offers`);
  if (!offers) return <p className="muted">{t('common.loading')}</p>;

  // One thread per buyer, oldest move first.
  const threads = new Map<string, Offer[]>();
  for (const o of [...offers].reverse()) threads.set(o.buyerId, [...(threads.get(o.buyerId) ?? []), o]);
  const open = offers.some((o) => o.status === 'OPEN');

  return (
    <section className="stack panel">
      <h2>{isOwner ? t('offer.received') : t('offer.title')}</h2>
      {isOwner && threads.size === 0 && <p className="muted">{t('offer.none')}</p>}
      {[...threads.values()].map((thread) => (
        <div key={thread[0].buyerId} className="thread">
          {isOwner && <b>{thread[0].buyer.fullName}</b>}
          {thread.map((o) => (
            <OfferRow key={o.id} offer={o} listing={listing} isOwner={isOwner} onChange={refresh} />
          ))}
        </div>
      ))}
      {!isOwner && !open && listing.status === 'ACTIVE' && <NewOffer listing={listing} onDone={refresh} />}
      {!isOwner && <p className="muted small">{t('listing.perUnit', { unit: name(listing.unit) })}</p>}
    </section>
  );
}

function OfferRow({ offer, listing, isOwner, onChange }: { offer: Offer; listing: Listing; isOwner: boolean; onChange: () => void }) {
  const { t, tError, name, num, date } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [price, setPrice] = useState('');

  const mine = offer.madeByFarmer === isOwner;
  const myTurn = offer.status === 'OPEN' && !mine;
  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/offers/${offer.id}/${path}`, { method: 'POST', body });
      onChange();
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      onChange();
    } finally {
      setBusy(false);
    }
  };
  const counter = (e: FormEvent) => {
    e.preventDefault();
    run('counter', { pricePerUnit: Number(price) });
  };

  const who = mine ? t('offer.you') : offer.madeByFarmer ? t('offer.farmer') : offer.buyer.fullName;
  return (
    <div className={`offer ${offer.status === 'OPEN' ? 'open' : ''}`}>
      <div className="row between">
        <span>
          <b>{who}:</b>{' '}
          {t('offer.line', { price: num(offer.pricePerUnit), qty: num(offer.quantity), unit: name(listing.unit), date: date(offer.pickupDate) })}
        </span>
        <span className={`badge ${offer.status === 'ACCEPTED' ? '' : 'badge-muted'}`}>{t(`offer.status.${offer.status}`)}</span>
      </div>
      {offer.status === 'OPEN' && <div className="muted small">{t('offer.expires', { date: date(offer.expiresAt, true) })}</div>}
      {offer.status === 'OPEN' && mine && (
        <div className="row wrap">
          <span className="muted small">{t('offer.waiting')}</span>
          <button className="link" disabled={busy} onClick={() => run('withdraw')}>
            {t('offer.withdraw')}
          </button>
        </div>
      )}
      {myTurn && (
        <div className="row wrap">
          <button disabled={busy} onClick={() => run('accept')}>
            {t('offer.accept')}
          </button>
          <button className="secondary" disabled={busy} onClick={() => setCountering((c) => !c)}>
            {t('offer.counter')}
          </button>
          <button className="danger" disabled={busy} onClick={() => run('reject')}>
            {t('offer.reject')}
          </button>
        </div>
      )}
      {myTurn && countering && (
        <form className="row" onSubmit={counter}>
          <Field label={t('offer.counterPrice')}>
            <input type="number" inputMode="decimal" min={1} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <button disabled={busy || !price}>{t('offer.sendCounter')}</button>
        </form>
      )}
      {offer.order && (
        <p>
          ✓ {t('offer.dealDone')} · <Link href={`/orders/${offer.order.id}`}>{t('offer.viewDeal')}</Link>
        </p>
      )}
      <ErrorText message={error} />
    </div>
  );
}

function NewOffer({ listing, onDone }: { listing: Listing; onDone: () => void }) {
  const { t, tError, name } = useI18n();
  const [price, setPrice] = useState(listing.pricePerUnit ?? '');
  const [quantity, setQuantity] = useState(String(Number(listing.quantityLeft)));
  const [pickupDate, setPickupDate] = useState(inDays(1) <= listing.availableUntil.slice(0, 10) ? inDays(1) : inDays(0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/listings/${listing.id}/offers`, {
        body: { pricePerUnit: Number(price), quantity: Number(quantity), pickupDate },
      });
      onDone();
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  const unit = name(listing.unit);
  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <Field label={t('offer.price', { unit })}>
          <input type="number" inputMode="decimal" min={1} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t('offer.quantity', { unit })}>
          <input
            type="number"
            inputMode="decimal"
            min={0.01}
            step="0.01"
            max={Number(listing.quantityLeft)}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
      </div>
      <Field label={t('offer.pickup')}>
        <input type="date" required min={inDays(0)} max={listing.availableUntil.slice(0, 10)} value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} />
      </Field>
      <ErrorText message={error} />
      <button disabled={busy}>{busy ? t('common.saving') : t('offer.make')}</button>
    </form>
  );
}
