'use client';

import { useParams } from 'next/navigation';
import { ReportButton } from '@/components/ReportButton';
import { Stars } from '@/components/Stars';
import { ApiError, photoUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { PublicProfile, Review } from '@/lib/types';

/** What anyone can see about a farmer or buyer: ratings and reviews, never the phone number. */
export default function UserPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tError, name, num, date } = useI18n();
  const { me } = useAuth();
  const { data: user, error } = useApi<PublicProfile>(`/users/${id}`);
  const { data: reviews } = useApi<Review[]>(`/users/${id}/reviews`);

  if (error) return <p className="muted">{tError(error instanceof ApiError ? error.code : undefined)}</p>;
  if (!user) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div className="stack narrow">
      <div className="row">
        <div className="avatar">{user.photoUrl ? <img src={photoUrl(user.photoUrl)} alt="" /> : user.fullName.slice(0, 1)}</div>
        <div>
          <h1>{user.fullName}</h1>
          <span className="muted small">
            {user.roles.map((r) => t(`role.${r}`)).join(' · ')}
            {user.isVerified && <span className="badge">✓ {t('listing.verified')}</span>}
          </span>
        </div>
      </div>
      <dl className="facts">
        <dt>{t('listing.location')}</dt>
        <dd>
          {[user.village, user.ward && `${t('location.ward')} ${num(user.ward.wardNo)}`, name(user.ward?.municipality)]
            .filter(Boolean)
            .join(', ')}
        </dd>
        <dt>{t('user.memberSince')}</dt>
        <dd>{date(user.memberSince)}</dd>
        <dt>{t('user.rating')}</dt>
        <dd>
          {user.rating.count > 0 ? (
            <>
              <Stars value={user.rating.average ?? 0} /> {num((user.rating.average ?? 0).toFixed(1))} ·{' '}
              {t('user.reviewCount', { n: num(user.rating.count) })}
            </>
          ) : (
            <span className="muted">{t('user.noReviews')}</span>
          )}
        </dd>
        {user.roles.includes('FARMER') && (
          <>
            <dt>{t('user.activeListings')}</dt>
            <dd>{num(user.activeListings)}</dd>
          </>
        )}
      </dl>

      {reviews && reviews.length > 0 && (
        <section className="stack">
          <h2>{t('review.title')}</h2>
          <ul className="plain-list stack">
            {reviews.map((r) => (
              <li key={r.id}>
                <Stars value={r.rating} /> {r.comment}
                <div className="muted small">
                  {r.reviewer.fullName} · {t(r.order.buyerId === r.reviewer.id ? 'review.boughtCrop' : 'review.soldCrop', { crop: name(r.order.listing.crop) })} ·{' '}
                  {date(r.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {me && me.id !== user.id && <ReportButton targetType="USER" targetId={user.id} />}
    </div>
  );
}
