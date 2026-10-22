'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { messages, MessageKey } from '@/lib/messages';
import { AppNotification } from '@/lib/types';
import { notifyUnreadChanged } from '@/components/Header';

export default function NotificationsPage() {
  const { t, name, num, date } = useI18n();
  const me = useRequireProfile();
  const router = useRouter();
  const { data, setData } = useApi<{ items: AppNotification[]; unread: number }>(me ? '/me/notifications' : null);

  const markRead = async (ids?: string[]) => {
    const res = await api<{ unread: number }>('/me/notifications/read', { body: ids ? { ids } : {} }).catch(() => null);
    if (!res || !data) return;
    const now = new Date().toISOString();
    setData({
      unread: res.unread,
      items: data.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
    });
    notifyUnreadChanged();
  };

  const text = (n: AppNotification) => {
    const d = n.data;
    if (n.type === 'LISTING_MATCH' && d.crop) {
      return t('notifications.match', {
        crop: name(d.crop),
        price: num(d.price ?? 0),
        unit: name(d.unit),
        place: [d.village, name(d.municipality)].filter(Boolean).join(', '),
      });
    }
    const key = `notifications.${n.type}` as MessageKey;
    return key in messages.en ? t(key, { crop: name(d.crop), price: num(d.price ?? 0) }) : n.type;
  };

  return (
    <div className="stack narrow">
      <div className="row between">
        <h1>{t('notifications.title')}</h1>
        {data && data.unread > 0 && (
          <button className="link" onClick={() => markRead()}>
            {t('notifications.markAll')}
          </button>
        )}
      </div>
      <p>
        🔔 <Link href="/alerts">{t('notifications.manage')}</Link>
      </p>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.items.length === 0 ? (
        <p className="muted">{t('notifications.empty')}</p>
      ) : (
        <ul className="plain-list">
          {data.items.map((n) => (
            <li key={n.id} className={n.readAt ? 'notification' : 'notification unread'}>
              <button
                className="notification-body"
                onClick={async () => {
                  if (!n.readAt) await markRead([n.id]);
                  if (n.data.orderId) router.push(`/orders/${n.data.orderId}`);
                  else if (n.data.listingId) router.push(`/listings/${n.data.listingId}`);
                }}
              >
                <span>{text(n)}</span>
                <span className="muted small">{date(n.createdAt, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
