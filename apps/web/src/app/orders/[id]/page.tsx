'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, ReactNode, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { ReportButton } from '@/components/ReportButton';
import { Stars } from '@/components/Stars';
import { api, ApiError } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Order, OrderStatus, PaymentMethod } from '@/lib/types';

const STEPS: OrderStatus[] = ['CONFIRMED', 'READY_FOR_PICKUP', 'PICKED_UP', 'COMPLETED'];
type Panel = 'ready' | 'pickup' | 'paid' | 'received' | 'cancel' | null;

/** A pickup agreed in an offer is a date only, stored as UTC midnight; one set here has a time. */
const dateOnly = (iso: string) => iso.slice(11, 19) === '00:00:00';

/** `datetime-local` wants local time without a zone. A date-only pickup starts at 9 in the morning. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  if (dateOnly(iso)) return `${iso.slice(0, 10)}T09:00`;
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tError, name, num, date } = useI18n();
  const me = useRequireProfile();
  const { data: order, setData, error } = useApi<Order>(me ? `/orders/${id}` : null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <p className="muted">{tError(error instanceof ApiError ? error.code : undefined)}</p>;
  if (!order || !me) return <p className="muted">{t('common.loading')}</p>;

  const iAmBuyer = order.buyerId === me.id;
  const other = iAmBuyer ? order.farmer : order.buyer;
  const unit = name(order.listing.unit);
  const total = Number(order.pricePerUnit) * Number(order.quantity);
  const beforePickup = order.status === 'CONFIRMED' || order.status === 'READY_FOR_PICKUP';
  const open = beforePickup || order.status === 'PICKED_UP';
  const myReview = order.reviews.find((r) => r.reviewerId === me.id);
  const theirReview = order.reviews.find((r) => r.reviewerId !== me.id);

  const run = async (path: string, body: object = {}, method = 'POST') => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await api<Order>(`/orders/${order.id}${path}`, { method, body }));
      setPanel(null);
    } catch (err) {
      setActionError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (p: Panel) => {
    setActionError(null);
    setPanel(panel === p ? null : p);
  };

  return (
    <article className="stack narrow">
      <h1>
        {t('order.title')}: {name(order.listing.crop)}
      </h1>

      {order.status === 'CANCELLED' ? (
        <p className="notice">
          <b>{t('order.status.CANCELLED')}</b>
          {' · '}
          {t(order.cancelledById === me.id ? 'order.cancelledByYou' : 'order.cancelledByOther', { name: other.fullName })}
          <br />
          {order.cancelReason}
        </p>
      ) : (
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={STEPS.indexOf(order.status) >= i ? 'done' : ''}>
              {t(`order.status.${s}`)}
            </li>
          ))}
        </ol>
      )}

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
        <dt>{t('order.pickup')}</dt>
        <dd>
          {order.pickupAt ? date(order.pickupAt, !dateOnly(order.pickupAt)) : <span className="muted">{t('order.notSet')}</span>}
          {order.pickupPlace && <div>{order.pickupPlace}</div>}
        </dd>
        <dt>{t('order.payment')}</dt>
        <dd>
          {order.paidStatus === 'PAID'
            ? `✓ ${t('order.paid')}`
            : order.buyerPaidAt
              ? t('order.buyerSaysPaid')
              : t('order.unpaid')}
          {order.paymentMethod && <span className="muted"> · {t(`order.method.${order.paymentMethod}`)}</span>}
        </dd>
        <dt>{t(iAmBuyer ? 'order.farmer' : 'order.buyer')}</dt>
        <dd>
          <Link href={`/users/${other.id}`}>{other.fullName}</Link>
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

      {open && (
        <section className="stack">
          <p className="notice small">{t('order.payNote')}</p>
          <div className="row wrap">
            {!iAmBuyer && order.status === 'CONFIRMED' && <button onClick={() => toggle('ready')}>{t('order.markReady')}</button>}
            {beforePickup && (
              <button className={!iAmBuyer && order.status === 'CONFIRMED' ? 'secondary' : ''} disabled={busy} onClick={() => run('/picked-up')}>
                {t('order.markPickedUp')}
              </button>
            )}
            {iAmBuyer && !order.buyerPaidAt && order.paidStatus === 'UNPAID' && (
              <button className="secondary" onClick={() => toggle('paid')}>{t('order.markPaid')}</button>
            )}
            {!iAmBuyer && order.paidStatus === 'UNPAID' && (
              <button className={order.buyerPaidAt ? '' : 'secondary'} onClick={() => toggle('received')}>{t('order.markReceived')}</button>
            )}
            {beforePickup && <button className="secondary" onClick={() => toggle('pickup')}>{t('order.changePickup')}</button>}
            {beforePickup && order.paidStatus === 'UNPAID' && (
              <button className="danger" onClick={() => toggle('cancel')}>{t('order.cancel')}</button>
            )}
          </div>

          {(panel === 'ready' || panel === 'pickup') && (
            <PickupForm
              order={order}
              submitLabel={t(panel === 'ready' ? 'order.markReady' : 'order.savePickup')}
              busy={busy}
              onSubmit={(body) => (panel === 'ready' ? run('/ready', body) : run('', body, 'PATCH'))}
            />
          )}
          {(panel === 'paid' || panel === 'received') && (
            <PaymentForm
              initial={order.paymentMethod}
              submitLabel={t(panel === 'paid' ? 'order.markPaid' : 'order.markReceived')}
              hint={t(panel === 'paid' ? 'order.paidHint' : 'order.receivedHint')}
              busy={busy}
              onSubmit={(method) => run(panel === 'paid' ? '/paid' : '/payment-received', { method })}
            />
          )}
          {panel === 'cancel' && (
            <TextForm
              label={t('order.cancelReason')}
              hint={t('order.cancelHint')}
              minLength={3}
              submitLabel={t('order.cancel')}
              danger
              busy={busy}
              onSubmit={(reason) => run('/cancel', { reason })}
            />
          )}
          <ErrorText message={actionError} />
        </section>
      )}

      {order.status === 'COMPLETED' && (
        <section className="stack">
          <h2>{t('review.title')}</h2>
          {myReview ? (
            <ReviewLine label={t('review.yours')} rating={myReview.rating} comment={myReview.comment} />
          ) : (
            <ReviewForm busy={busy} name={other.fullName} onSubmit={(body) => run('/review', body)} />
          )}
          {theirReview && (
            <ReviewLine label={t('review.theirs', { name: other.fullName })} rating={theirReview.rating} comment={theirReview.comment} />
          )}
          <ErrorText message={actionError} />
        </section>
      )}

      <p>
        <Link href={`/listings/${order.listingId}`}>
          {name(order.listing.crop)} · {[order.listing.village, name(order.listing.ward.municipality)].filter(Boolean).join(', ')}
        </Link>
      </p>
      <ReportButton targetType="ORDER" targetId={order.id} />
    </article>
  );
}

function PickupForm({ order, submitLabel, busy, onSubmit }: {
  order: Order;
  submitLabel: string;
  busy: boolean;
  onSubmit: (body: { pickupAt?: string; pickupPlace?: string }) => void;
}) {
  const { t } = useI18n();
  const [at, setAt] = useState(toLocalInput(order.pickupAt));
  const [place, setPlace] = useState(order.pickupPlace ?? '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...(at ? { pickupAt: new Date(at).toISOString() } : {}), ...(place.trim() ? { pickupPlace: place.trim() } : {}) });
  };
  return (
    <form className="stack notice" onSubmit={submit}>
      <Field label={t('order.pickupAt')}>
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      <Field label={t('order.pickupPlace')}>
        <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={200} placeholder={t('order.pickupPlaceHint')} />
      </Field>
      <button disabled={busy}>{submitLabel}</button>
    </form>
  );
}

function PaymentForm({ initial, submitLabel, hint, busy, onSubmit }: {
  initial: PaymentMethod | null;
  submitLabel: string;
  hint: string;
  busy: boolean;
  onSubmit: (method: PaymentMethod) => void;
}) {
  const { t } = useI18n();
  const [method, setMethod] = useState<PaymentMethod>(initial ?? 'CASH');
  return (
    <form className="stack notice" onSubmit={(e) => { e.preventDefault(); onSubmit(method); }}>
      <fieldset className="field">
        <legend className="field-label">{t('order.method')}</legend>
        {(['CASH', 'BANK_TRANSFER'] as const).map((m) => (
          <label key={m} className="check">
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
            {t(`order.method.${m}`)}
          </label>
        ))}
      </fieldset>
      <p className="muted small">{hint}</p>
      <button disabled={busy}>{submitLabel}</button>
    </form>
  );
}

function TextForm({ label, hint, minLength, submitLabel, danger, busy, onSubmit }: {
  label: string;
  hint?: string;
  minLength: number;
  submitLabel: string;
  danger?: boolean;
  busy: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <form className="stack notice" onSubmit={(e) => { e.preventDefault(); onSubmit(text.trim()); }}>
      <Field label={label} hint={hint}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} minLength={minLength} maxLength={500} required />
      </Field>
      <button className={danger ? 'danger' : ''} disabled={busy || text.trim().length < minLength}>
        {submitLabel}
      </button>
    </form>
  );
}

function ReviewForm({ busy, name, onSubmit }: { busy: boolean; name: string; onSubmit: (body: { rating: number; comment?: string }) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <form
      className="stack notice"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      }}
    >
      <Field label={t('review.ask', { name })}>
        <Stars value={rating} onChange={setRating} />
      </Field>
      <Field label={t('review.comment')}>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={500} />
      </Field>
      <button disabled={busy || rating === 0}>{t('review.send')}</button>
    </form>
  );
}

function ReviewLine({ label, rating, comment }: { label: ReactNode; rating: number; comment: string | null }) {
  return (
    <div>
      <span className="muted small">{label}</span>
      <div>
        <Stars value={rating} /> {comment}
      </div>
    </div>
  );
}
