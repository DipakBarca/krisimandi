'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { toNepaliDigits, useI18n } from '@/lib/i18n';
import { AuctionState, Listing } from '@/lib/types';
import { ErrorText, Field } from './Field';

const POLL_MS = 5000;

/**
 * Live auction box. It refreshes every few seconds rather than holding a socket open,
 * which copes better with patchy mobile data. The countdown runs on the server's clock.
 */
export function AuctionPanel({
  listing,
  isOwner,
  canBid,
  onClosed,
}: {
  listing: Listing;
  isOwner: boolean;
  canBid: boolean;
  onClosed?: () => void;
}) {
  const { t, tError, name, num, date, lang } = useI18n();
  const [state, setState] = useState<AuctionState | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((s: AuctionState) => {
    setState(s);
    setOffset(new Date(s.serverTime).getTime() - Date.now());
  }, []);

  const load = useCallback(() => api<AuctionState>(`/listings/${listing.id}/auction`).then(apply).catch(() => {}), [listing.id, apply]);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const status = state?.status;
  useEffect(() => {
    if (status && status !== 'LIVE') onClosed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!state) return <p className="muted">{t('common.loading')}</p>;

  const left = new Date(state.endsAt).getTime() - (now + offset);
  const live = state.status === 'LIVE' && left > 0;
  const unit = name(listing.unit);

  const run = async (fn: () => Promise<AuctionState>) => {
    setBusy(true);
    setError(null);
    try {
      apply(await fn());
      setAmount('');
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      load();
    } finally {
      setBusy(false);
    }
  };
  const bid = (e: FormEvent) => {
    e.preventDefault();
    run(() => api<AuctionState>(`/listings/${listing.id}/bids`, { body: { amountPerUnit: Number(amount) } }));
  };

  return (
    <section className="stack panel">
      <div className="auction-head">
        <div>
          <div className="muted small">{t('auction.highest')}</div>
          <div className="price big">
            {state.highest ? `${t('common.rs')} ${num(state.highest)}` : <span className="muted">{t('auction.noBids')}</span>}
          </div>
          {state.hasReserve && (
            <div className={`small ${state.reserveMet ? 'distance' : 'muted'}`}>
              {t(state.reserveMet ? 'auction.reserveMet' : 'auction.reserveNotMet')}
            </div>
          )}
        </div>
        <div className="countdown">
          <div className="muted small">{live ? t('auction.endsIn') : ''}</div>
          <div className="timer">{live ? countdown(left, lang === 'ne', t) : t('auction.ended')}</div>
        </div>
      </div>

      {live && state.iAmLeading && <p className="notice good">✓ {t('auction.leading')}</p>}
      {live && !state.iAmLeading && state.myHighest && <p className="notice warn">{t('auction.outbid')}</p>}

      {live && canBid && (
        <form className="row" onSubmit={bid}>
          <Field label={t('auction.yourBid', { unit })} hint={t('auction.nextMin', { price: num(state.nextMin) })}>
            <input
              type="number"
              inputMode="decimal"
              min={Number(state.nextMin)}
              step="0.01"
              required
              value={amount}
              placeholder={String(Number(state.nextMin))}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <button disabled={busy}>{t('auction.place')}</button>
        </form>
      )}
      {live && <p className="muted small">{t('auction.whole', { unit, qty: num(listing.quantityLeft) })} {t('auction.extendHint')}</p>}

      {state.status === 'AWAITING_CONFIRMATION' &&
        (isOwner ? (
          <div className="notice stack">
            <b>{t('auction.confirmTitle', { name: state.winnerName ?? '', price: num(state.winningAmount ?? 0) })}</b>
            {state.confirmBy && <span className="small">{t('auction.confirmBy', { date: date(state.confirmBy, true) })}</span>}
            <div className="row wrap">
              <button disabled={busy} onClick={() => run(() => api<AuctionState>(`/listings/${listing.id}/auction/confirm`, { method: 'POST' }))}>
                {t('auction.confirm')}
              </button>
              <button className="secondary" disabled={busy} onClick={() => run(() => api<AuctionState>(`/listings/${listing.id}/auction/pass`, { method: 'POST' }))}>
                {t('auction.pass')}
              </button>
            </div>
          </div>
        ) : state.iAmWinner ? (
          <p className="notice good">✓ {t('auction.youWonPending', { date: date(state.confirmBy ?? state.endsAt, true) })}</p>
        ) : (
          <p className="notice">{t('auction.awaitingFarmer')}</p>
        ))}
      {state.status === 'CLOSED' && (
        <p className="notice good">
          ✓ {t('auction.closed')} {state.orderId && <Link href={`/orders/${state.orderId}`}>{t('offer.viewDeal')}</Link>}
        </p>
      )}
      {state.status === 'NO_SALE' && <p className="notice">{t('auction.noSale')}</p>}

      <ErrorText message={error} />

      {state.bids.length > 0 && (
        <details open={isOwner || undefined}>
          <summary>{t('auction.bids', { n: num(state.bidCount) })}</summary>
          <ol className="bids">
            {state.bids.map((b, i) => (
              <li key={i}>
                <span>
                  {b.bidder === 'you' ? <b>{t('auction.you')}</b> : b.name ?? t('auction.bidder', { n: num(b.bidder.slice(1)) })}
                </span>
                <span>
                  {t('common.rs')} {num(b.amountPerUnit)}
                </span>
                <span className="muted small">{date(b.placedAt, true)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function countdown(ms: number, nepali: boolean, t: ReturnType<typeof useI18n>['t']) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  let text = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  if (days > 0) text = `${t('auction.days', { n: days })} ${text}`;
  return nepali ? toNepaliDigits(text) : text;
}
