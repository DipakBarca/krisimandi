'use client';

import Link from 'next/link';
import { photoUrl } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Conversation } from '@/lib/types';

export default function MessagesPage() {
  const { t, name, num, date } = useI18n();
  const me = useRequireProfile();
  const { data } = useApi<Conversation[]>(me ? '/me/conversations' : null);

  return (
    <div className="stack narrow">
      <h1>{t('chat.title')}</h1>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="muted">{t('chat.noConversations')}</p>
      ) : (
        <ul className="plain-list">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="deal-row">
                <span className="thumb">
                  {c.listing.photos[0] ? <img src={photoUrl(c.listing.photos[0].url)} alt="" /> : name(c.listing.crop).slice(0, 1)}
                </span>
                <span className="grow">
                  <b>{c.other.fullName}</b> <span className="muted small">· {t('chat.about', { crop: name(c.listing.crop) })}</span>
                  <br />
                  <span className={`small ${c.unread ? '' : 'muted'}`}>
                    {c.lastMessage ? (c.lastMessage.body ?? `📷 ${t('chat.photo')}`) : ''}
                  </span>
                </span>
                <span className="stack-end">
                  {c.lastMessage && <span className="muted small">{date(c.lastMessage.createdAt, true)}</span>}
                  {!!c.unread && <span className="count-dot">{num(c.unread)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
