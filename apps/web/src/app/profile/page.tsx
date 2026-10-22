'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { ProfileForm } from '@/components/ProfileForm';
import { api, ApiError, photoUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

type Doc = { id: string; docType: 'CITIZENSHIP' | 'PAN' | 'OTHER'; status: 'PENDING' | 'APPROVED' | 'REJECTED' };

export default function ProfilePage() {
  const { t, tError } = useI18n();
  const me = useRequireProfile();
  const { reload, signOut } = useAuth();
  const router = useRouter();
  const docs = useApi<Doc[]>(me ? '/me/verification-docs' : null);
  const [saved, setSaved] = useState(false);
  const [docType, setDocType] = useState<Doc['docType']>('CITIZENSHIP');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return <p className="muted">{t('common.loading')}</p>;

  const upload = async (path: string, form: FormData) => {
    setBusy(true);
    setError(null);
    try {
      await api(path, { body: form });
      return true;
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    if (await upload('/me/photo', form)) await reload();
  };

  const sendDoc = async (e: FormEvent) => {
    e.preventDefault();
    if (!docFile) return;
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', docFile);
    if (await upload('/me/verification-docs', form)) {
      setDocFile(null);
      docs.refresh();
    }
  };

  return (
    <div className="narrow stack">
      <h1>{t('profile.title')}</h1>
      <div className="row">
        <div className="avatar">{me.photoUrl ? <img src={photoUrl(me.photoUrl)} alt="" /> : me.fullName.slice(0, 1)}</div>
        <label className="button secondary file">
          {t('profile.photo')}
          <input type="file" accept="image/*" onChange={changePhoto} hidden />
        </label>
        {me.isVerified && <span className="badge">✓ {t('listing.verified')}</span>}
      </div>

      <ProfileForm me={me} submitLabel={t('onboarding.save')} onSaved={() => setSaved(true)} />
      {saved && <p className="muted">✓ {t('profile.saved')}</p>}

      {!me.isVerified && (
        <section className="stack">
          <h2>{t('profile.verify')}</h2>
          <p className="muted small">{t('profile.verifyHint')}</p>
          {docs.data?.map((d) => (
            <p key={d.id} className="small">
              {t(`profile.doc.${d.docType}`)}: {t(`profile.docStatus.${d.status}`)}
            </p>
          ))}
          <form onSubmit={sendDoc} className="stack">
            <Field label={t('profile.docType')}>
              <select value={docType} onChange={(e) => setDocType(e.target.value as Doc['docType'])}>
                <option value="CITIZENSHIP">{t('profile.doc.CITIZENSHIP')}</option>
                <option value="PAN">{t('profile.doc.PAN')}</option>
                <option value="OTHER">{t('profile.doc.OTHER')}</option>
              </select>
            </Field>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
            <button className="secondary" disabled={busy || !docFile}>
              {t('profile.upload')}
            </button>
          </form>
        </section>
      )}
      <ErrorText message={error} />

      <Link href="/complaints">{t('report.mine')}</Link>
      <button className="link" onClick={async () => { await signOut(); router.replace('/'); }}>
        {t('nav.logout')}
      </button>
    </div>
  );
}
