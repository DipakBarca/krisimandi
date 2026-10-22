'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorText } from '@/components/Field';
import { notifyUnreadChanged } from '@/components/Header';
import { api, ApiError, photoUrl } from '@/lib/api';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { ChatMessage, Conversation } from '@/lib/types';

const POLL_MS = 5000;

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tError, name, date } = useI18n();
  const me = useRequireProfile();
  const { data: convo, error: loadError } = useApi<Conversation>(me ? `/conversations/${id}` : null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | undefined>(undefined);

  // Polls for new messages; each fetch also marks the other side's messages as read.
  const poll = useCallback(async () => {
    const after = lastId.current;
    const rows = await api<ChatMessage[]>(`/conversations/${id}/messages${after ? `?after=${after}` : ''}`).catch(() => null);
    if (!rows) return;
    if (rows.length) lastId.current = rows.at(-1)!.id;
    setMessages((prev) => {
      const seen = new Set((prev ?? []).map((m) => m.id));
      return [...(prev ?? []), ...rows.filter((m) => !seen.has(m.id))];
    });
    // New messages from the other side were just marked read, so the header badge can drop.
    if (rows.length) notifyUnreadChanged();
  }, [id]);

  useEffect(() => {
    if (!me) return;
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [me, poll]);

  useEffect(() => bottom.current?.scrollIntoView({ block: 'end' }), [messages?.length]);

  const send = async (fn: () => Promise<ChatMessage>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await poll();
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send(async () => {
      const m = await api<ChatMessage>(`/conversations/${id}/messages`, { body: { body: text } });
      setText('');
      return m;
    });
  };
  const photo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    send(() => api<ChatMessage>(`/conversations/${id}/photos`, { body: form }));
  };

  if (loadError) return <p className="muted">{tError(loadError instanceof ApiError ? loadError.code : undefined)}</p>;
  if (!convo || !me) return <p className="muted">{t('common.loading')}</p>;

  return (
    <div className="chat narrow">
      <div className="chat-head">
        <div>
          <b>{convo.other.fullName}</b>
          <div className="small">
            <Link href={`/listings/${convo.listingId}`}>{t('chat.about', { crop: name(convo.listing.crop) })}</Link>
          </div>
        </div>
        {convo.other.phone ? (
          <a className="button secondary" href={`tel:${convo.other.phone}`}>
            📞 {convo.other.phone}
          </a>
        ) : (
          <span className="muted small">{t('chat.phoneHidden')}</span>
        )}
      </div>

      <div className="chat-log" aria-live="polite">
        {messages === null ? (
          <p className="muted">{t('common.loading')}</p>
        ) : messages.length === 0 ? (
          <p className="muted">{t('chat.empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`bubble ${m.senderId === me.id ? 'mine' : ''}`}>
              {m.photoUrl && (
                <a href={photoUrl(m.photoUrl)} target="_blank" rel="noreferrer">
                  <img src={photoUrl(m.photoUrl)} alt="" />
                </a>
              )}
              {m.body && <span className="bubble-text">{m.body}</span>}
              <span className="bubble-time">{date(m.createdAt, true)}</span>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      <ErrorText message={error} />
      <form className="chat-input" onSubmit={submit}>
        <label className="button secondary file" aria-label={t('chat.photo')} title={t('chat.photo')}>
          📷
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onChange={photo} hidden />
        </label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chat.placeholder')} maxLength={2000} aria-label={t('chat.placeholder')} />
        <button disabled={busy || !text.trim()}>{t('chat.send')}</button>
      </form>
    </div>
  );
}
