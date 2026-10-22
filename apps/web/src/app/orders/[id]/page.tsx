'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Order } from '@/lib/types';

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tError, name, num, date } = useI18n();
  const me = useRequireProfile();
  const { data: order, error } = useApi<Order>(me ? `/orders/${id}` : null);

  if (error) return <p className="muted">{tError(error instanceof ApiError ? error.code : undefined)}</p>;
  if (!order || !me) return <p className="muted">{t('common.loading')}</p>;

  const iAmBuyer = order.buyerId === me.id;
  const other = iAmBuyer ? order.farmer : order.buyer;
  const unit = name(order.listing.unit);
  const total = Number(order.pricePerUnit) * Number(order.quantity);

  return (
    <article className="stack narrow">
      <h1>
        {t('order.title')}: {name(order.listing.crop)}
      </h1>
      <span className="badge">{t(`order.status.${order.status}`)}</span>
      <dl className="facts">
        <dt>{t('order.price')}</dt>
        <dd>
          {t('common.rs')} {num(order.pricePerUnit)} {t('listing.perUnit', { unit })}
        </dd>
        <dt>{t('order.quantity')}</dt>
        <dd>
          {num(order.quantity)} {unit}
        </dd>
        <dt>{t('order.total')}</dt>
        <dd>
          <b>
            {t('common.rs')} {num(total)}
          </b>
        </dd>
        {order.pickupAt && (
          <>
            <dt>{t('order.pickup')}</dt>
            <dd>{date(order.pickupAt)}</dd>
          </>
        )}
        <dt>{t(iAmBuyer ? 'order.farmer' : 'order.buyer')}</dt>
        <dd>
          {other.fullName}
          {other.village && <span className="muted"> · {other.village}</span>}
        </dd>
        <dt>{t('order.phone')}</dt>
        <dd>
          {other.phone && (
            <a href={`tel:${other.phone}`} className="button">
              📞 {other.phone}
            </a>
          )}
        </dd>
      </dl>
      <p className="notice">{t('order.payNote')}</p>
      <p>
        <Link href={`/listings/${order.listingId}`}>
          {name(order.listing.crop)} · {[order.listing.village, name(order.listing.ward.municipality)].filter(Boolean).join(', ')}
        </Link>
      </p>
    </article>
  );
}
