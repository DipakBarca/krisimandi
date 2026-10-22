'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChangeEvent, useState } from 'react';
import { ErrorText } from '@/components/Field';
import { AuctionPanel } from '@/components/AuctionPanel';
import { OfferPanel } from '@/components/OfferPanel';
import { SaveButton } from '@/components/SaveButton';
import { api, ApiError, photoUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Conversation, Listing, ListingResult } from '@/lib/types';

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tError, name, num, date } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();
  // Wait for auth so the owner gets the exact location and reserve price.
  const { data: listing, setData, error, refresh } = useApi<ListingResult>(loading ? null : `/listings/${id}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <p className="muted">{tError(error instanceof ApiError ? error.code : undefined)}</p>;
  if (!listing) return <p className="muted">{t('common.loading')}</p>;

  const isOwner = me?.id === listing.farmerId;
  // Once an auction stops taking bids, the farmer acts through the auction box instead.
  const auctionOver = listing.saleMode === 'AUCTION' && listing.auction?.status !== 'LIVE';
  const run = async (fn: () => Promise<Listing | void>) => {
    setBusy(true);
    setActionError(null);
    try {
      const updated = await fn();
      if (updated) setData(updated);
    } catch (err) {
      setActionError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };
  const action = (path: string, body?: unknown) => run(() => api<Listing>(`/listings/${listing.id}/${path}`, { method: 'POST', body }));

  const addPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    run(() => api<Listing>(`/listings/${listing.id}/photos`, { body: form }));
  };

  const price = listing.saleMode === 'FIXED' ? listing.pricePerUnit : listing.auction?.startPrice;

  return (
    <article className="stack">
      {listing.photos.length > 0 && (
        <div className="gallery">
          {listing.photos.map((p) => (
            <figure key={p.id}>
              <img src={photoUrl(p.url)} alt="" />
              {isOwner && (
                <button className="link small" disabled={busy} onClick={() => run(() => api<Listing>(`/listings/${listing.id}/photos/${p.id}`, { method: 'DELETE' }))}>
                  ✕
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      <div>
        <h1>
          {name(listing.crop)}
          {listing.variety && <span className="muted"> · {listing.variety}</span>}
        </h1>
        <span className={`badge ${listing.saleMode === 'AUCTION' ? 'badge-auction' : ''}`}>
          {t(listing.saleMode === 'AUCTION' ? 'listing.auction' : 'listing.fixed')}
        </span>
        <span className="badge badge-muted">{t(`listing.status.${listing.status}`)}</span>
      </div>

      <p className="price big">
        {listing.saleMode === 'AUCTION' && <span className="muted small">{t('listing.startPrice')} </span>}
        {t('common.rs')} {num(price ?? 0)} <span className="muted">{t('listing.perUnit', { unit: name(listing.unit) })}</span>
      </p>

      <dl className="facts">
        <dt>{t('form.quantity')}</dt>
        <dd>{t('listing.available', { qty: num(listing.quantityLeft), unit: name(listing.unit) })}</dd>
        {listing.grade && (
          <>
            <dt>{t('form.grade')}</dt>
            <dd>{listing.grade}</dd>
          </>
        )}
        <dt>{t('listing.harvested')}</dt>
        <dd>{date(listing.harvestDate)}</dd>
        <dt>{t('listing.until')}</dt>
        <dd>{date(listing.availableUntil)}</dd>
        {listing.auction && (
          <>
            <dt>{t('listing.endsAt')}</dt>
            <dd>{date(listing.auction.endsAt, true)}</dd>
            <dt>{t('form.minIncrement')}</dt>
            <dd>
              {t('common.rs')} {num(listing.auction.minIncrement)}
            </dd>
            {isOwner && listing.auction.reservePrice ? (
              <>
                <dt>{t('form.reservePrice')}</dt>
                <dd>
                  {t('common.rs')} {num(listing.auction.reservePrice)}
                </dd>
              </>
            ) : (
              listing.auction.hasReserve && (
                <>
                  <dt />
                  <dd className="muted">{t('listing.hasReserve')}</dd>
                </>
              )
            )}
          </>
        )}
        <dt>{t('listing.location')}</dt>
        <dd>
          {[listing.village, `${t('location.ward')} ${num(listing.ward.wardNo)}`, name(listing.ward.municipality)].filter(Boolean).join(', ')}
        </dd>
      </dl>
      {listing.location?.approximate && <p className="muted small">{t('listing.approxLocation')}</p>}
      {listing.description && <p>{listing.description}</p>}

      <p className="muted">
        {listing.farmer.fullName}
        {listing.farmer.isVerified && <span className="badge">✓ {t('listing.verified')}</span>}
      </p>

      {listing.saleMode === 'AUCTION' && listing.auction && (
        <AuctionPanel listing={listing} isOwner={isOwner} canBid={!!me?.roles.includes('BUYER') && !isOwner} onClosed={refresh} />
      )}
      {listing.saleMode === 'FIXED' && me && (isOwner || me.roles.includes('BUYER')) && <OfferPanel listing={listing} isOwner={isOwner} />}

      {isOwner ? (
        <section className="stack owner">
          <div className="row wrap">
            {listing.status === 'ACTIVE' && !auctionOver && <button className="secondary" disabled={busy} onClick={() => action('pause')}>{t('sell.pause')}</button>}
            {listing.status === 'PAUSED' && <button className="secondary" disabled={busy} onClick={() => action('resume')}>{t('sell.resume')}</button>}
            {(listing.status === 'ACTIVE' || listing.status === 'PAUSED') && !auctionOver && (
              <Link className="button secondary" href={`/sell/${listing.id}/edit`}>{t('sell.edit')}</Link>
            )}
            {/* Auctions are sold by confirming the winner, not by hand. */}
            {(listing.status === 'ACTIVE' || listing.status === 'PAUSED') && listing.saleMode === 'FIXED' && (
              <button className="secondary" disabled={busy} onClick={() => action('sold')}>{t('sell.sold')}</button>
            )}
            {(listing.status === 'EXPIRED' || listing.status === 'SOLD') && listing.saleMode === 'FIXED' && (
              <button className="secondary" disabled={busy} onClick={() => action('relist', { availableUntil: inDays(7) })}>{t('sell.relist')}</button>
            )}
            {listing.auction?.status !== 'AWAITING_CONFIRMATION' && <button
              className="danger"
              disabled={busy}
              onClick={() => run(async () => {
                await api(`/listings/${listing.id}`, { method: 'DELETE' });
                router.replace('/sell');
              })}
            >
              {t('sell.remove')}
            </button>}
          </div>
          {listing.photos.length < 6 && (
            <label className="button secondary file">
              + {t('sell.addPhoto')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={addPhoto} hidden />
            </label>
          )}
          <ErrorText message={actionError} />
        </section>
      ) : (
        <>
          {!me && (
            <p className="notice">
              <Link href="/login">{t('offer.loginFirst')}</Link>
            </p>
          )}
          {me && !me.roles.includes('BUYER') && <p className="notice">{t('offer.needBuyer')}</p>}
          <div className="row wrap">
            {me && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(async () => {
                  const convo = await api<Conversation>(`/listings/${listing.id}/conversation`, { method: 'POST' });
                  router.push(`/messages/${convo.id}`);
                })}
              >
                💬 {t('chat.message')}
              </button>
            )}
            <SaveButton listingId={listing.id} saved={!!listing.saved} withLabel />
          </div>
          <ErrorText message={actionError} />
        </>
      )}
    </article>
  );
}
