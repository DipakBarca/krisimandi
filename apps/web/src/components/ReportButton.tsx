'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { api, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ComplaintTarget } from '@/lib/types';

/** "Report a problem": sends a complaint about a user, listing or order to the admins. */
export function ReportButton({ targetType, targetId }: { targetType: ComplaintTarget; targetId: string }) {
  const { t, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="notice small">
        ✓ {t('report.sent')} <Link href="/complaints">{t('report.mine')}</Link>
      </p>
    );
  }
  if (!open) {
    return (
      <button className="link small" onClick={() => setOpen(true)}>
        ⚠ {t(`report.open.${targetType}`)}
      </button>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/complaints', { body: { targetType, targetId, reason } });
      setSent(true);
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="stack notice" onSubmit={submit}>
      <Field label={t(`report.open.${targetType}`)} hint={t('report.hint')}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} minLength={10} maxLength={1000} required />
      </Field>
      <div className="row">
        <button disabled={busy || reason.trim().length < 10}>{t('report.send')}</button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}
