'use client';

import Link from 'next/link';
import { photoUrl } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ListingResult } from '@/lib/types';
import { SaveButton } from './SaveButton';

export function ListingCard({
  listing,
  onSavedChange,
}: {
  listing: ListingResult;
  /** Shows the save heart when given (or when the listing carries a saved flag). */
  onSavedChange?: (saved: boolean) => void;
}) {
  const { t, name, num } = useI18n();
  const price = listing.saleMode === 'FIXED' ? listing.pricePerUnit : listing.auction?.startPrice;
  const photo = listing.photos[0];
  const showSave = onSavedChange !== undefined || listing.saved !== undefined;
  return (
    <div className="card-wrap">
      <Link href={`/listings/${listing.id}`} className="card">
        <div className="card-photo">
          {photo ? <img src={photoUrl(photo.url)} alt="" loading="lazy" /> : <span>{name(listing.crop).slice(0, 1)}</span>}
        </div>
        <div className="card-body">
          <div className="card-title">
            {name(listing.crop)}
            {listing.variety && <span className="muted"> · {listing.variety}</span>}
          </div>
          <div className="price">
            {t('common.rs')} {num(price ?? 0)} <span className="muted">{t('listing.perUnit', { unit: name(listing.unit) })}</span>
          </div>
          <div className="muted small">
            {t('listing.available', { qty: num(listing.quantityLeft), unit: name(listing.unit) })}
          </div>
          <div className="muted small">
            {[listing.village, name(listing.ward.municipality)].filter(Boolean).join(', ')}
          </div>
          {listing.distanceKm != null && (
            <div className="small distance">{t('listing.distance', { km: num(Math.max(listing.distanceKm, 0.5)) })}</div>
          )}
          <span className={`badge ${listing.saleMode === 'AUCTION' ? 'badge-auction' : ''}`}>
            {t(listing.saleMode === 'AUCTION' ? 'listing.auction' : 'listing.fixed')}
          </span>
          {listing.status !== 'ACTIVE' && <span className="badge badge-muted">{t(`listing.status.${listing.status}`)}</span>}
        </div>
      </Link>
      {showSave && <SaveButton listingId={listing.id} saved={!!listing.saved} onChange={onSavedChange} />}
    </div>
  );
}
