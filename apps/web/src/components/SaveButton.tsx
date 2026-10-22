'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

/** Heart toggle for saving a listing. Guests are sent to log in first. */
export function SaveButton({
  listingId,
  saved,
  onChange,
  withLabel,
}: {
  listingId: string;
  saved: boolean;
  onChange?: (saved: boolean) => void;
  withLabel?: boolean;
}) {
  const { t } = useI18n();
  const { me } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState(saved);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!me) return router.push('/login');
    const next = !value;
    setBusy(true);
    setValue(next);
    try {
      await api(`/listings/${listingId}/save`, { method: next ? 'PUT' : 'DELETE' });
      onChange?.(next);
    } catch {
      setValue(!next);
    } finally {
      setBusy(false);
    }
  };

  const label = t(value ? 'listing.unsave' : 'listing.save');
  return (
    <button
      type="button"
      className={withLabel ? 'secondary' : 'save-toggle'}
      aria-pressed={value}
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={toggle}
    >
      <span aria-hidden className={value ? 'heart on' : 'heart'}>
        {value ? '♥' : '♡'}
      </span>
      {withLabel && (value ? t('listing.saved') : t('listing.save'))}
    </button>
  );
}
