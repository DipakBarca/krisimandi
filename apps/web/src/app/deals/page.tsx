'use client';

import Link from 'next/link';
import { useState } from 'react';
import { photoUrl } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Offer, Order } from '@/lib/types';

type Tab = 'orders' | 'buying' | 'selling';

export default function DealsPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const [tab, setTab] = useState<Tab>('orders');
  const tabs: Tab[] = ['orders', ...(me?.roles.includes('BUYER') ? (['buying'] as const) : []), ...(me?.roles.includes('FARMER') ? (['selling'] as const) : [])];

  return (
    <div className="stack">
      <h1>{t('deals.title')}</h1>
      <div className="tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? '' : 'secondary'} onClick={() => setTab(k)}>
            {t(`deals.${k}`)}
          </button>
        ))}
      </div>
      {me && (tab === 'orders' ? <Orders /> : <Offers side={tab} />)}
    </div>
  );
}

function Orders() {
  const { t, name, num, date } = useI18n();
  const { data } = useApi<Order[]>('/me/orders');
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  if (!data.length) return <p className="muted">{t('deals.noOrders')}</p>;
  return (
    <ul className="plain-list">
      {data.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="deal-row">
            <Thumb url={o.listing.photos[0]?.url} letter={name(o.listing.crop).slice(0, 1)} />
            <span className="grow">
              <b>{name(o.listing.crop)}</b> · {num(o.quantity)} {name(o.listing.unit)} × {t('common.rs')} {num(o.pricePerUnit)}
              <br />
              <span className="muted small">
                {o.pickupAt ? `${t('order.pickup')}: ${date(o.pickupAt)}` : date(o.createdAt)}
              </span>
            </span>
            <span className="badge">{t(`order.status.${o.status}`)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Offers({ side }: { side: 'buying' | 'selling' }) {
  const { t, name, num, date } = useI18n();
  const { data } = useApi<Offer[]>(`/me/offers?side=${side}`);
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  if (!data.length) return <p className="muted">{t('deals.noOffers')}</p>;
  return (
    <ul className="plain-list">
      {data.map((o) => {
        const myTurn = o.status === 'OPEN' && o.madeByFarmer === (side === 'buying');
        return (
          <li key={o.id}>
            <Link href={`/listings/${o.listingId}`} className="deal-row">
              <Thumb url={o.listing.photos[0]?.url} letter={name(o.listing.crop).slice(0, 1)} />
              <span className="grow">
                <b>{name(o.listing.crop)}</b>
                {side === 'selling' && <span className="muted"> · {o.buyer.fullName}</span>}
                <br />
                <span className="small">
                  {o.madeByFarmer ? t('offer.farmer') : side === 'buying' ? t('offer.you') : o.buyer.fullName}:{' '}
                  {t('offer.line', { price: num(o.pricePerUnit), qty: num(o.quantity), unit: name(o.listing.unit), date: date(o.pickupDate) })}
                </span>
              </span>
              <span className={`badge ${myTurn ? 'badge-auction' : 'badge-muted'}`}>
                {myTurn ? '●' : ''} {t(`offer.status.${o.status}`)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Thumb({ url, letter }: { url?: string; letter: string }) {
  return <span className="thumb">{url ? <img src={photoUrl(url)} alt="" /> : letter}</span>;
}
