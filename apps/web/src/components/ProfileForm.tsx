'use client';

import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Me } from '@/lib/types';
import { ErrorText, Field } from './Field';
import { LocationPicker } from './LocationPicker';

/** Name, Farmer/Buyer roles and location. Used for onboarding and the profile page. */
export function ProfileForm({ me, onSaved, submitLabel }: { me: Me; onSaved: (roles: ('FARMER' | 'BUYER')[]) => void; submitLabel: string }) {
  const { t, tError, lang } = useI18n();
  const { reload } = useAuth();
  const [fullName, setFullName] = useState(me.fullName);
  const [roles, setRoles] = useState(me.roles.filter((r) => r !== 'ADMIN') as ('FARMER' | 'BUYER')[]);
  const [location, setLocation] = useState({ wardId: me.wardId, village: me.village ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (role: 'FARMER' | 'BUYER') =>
    setRoles((rs) => (rs.includes(role) ? rs.filter((r) => r !== role) : [...rs, role]));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!roles.length) return setError(t('error.ROLE_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      await api('/me', {
        method: 'PATCH',
        body: {
          fullName,
          roles,
          preferredLang: lang,
          wardId: location.wardId ?? undefined,
          village: location.village || undefined,
        },
      });
      await reload();
      onSaved(roles);
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="stack">
      <Field label={t('onboarding.name')}>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={80} required />
      </Field>
      <fieldset className="field">
        <legend className="field-label">{t('onboarding.iAm')}</legend>
        <label className="check">
          <input type="checkbox" checked={roles.includes('FARMER')} onChange={() => toggle('FARMER')} />
          {t('onboarding.farmer')}
        </label>
        <label className="check">
          <input type="checkbox" checked={roles.includes('BUYER')} onChange={() => toggle('BUYER')} />
          {t('onboarding.buyer')}
        </label>
      </fieldset>
      <LocationPicker value={location} onChange={(v) => setLocation(v)} initialMunicipalityId={me.ward?.municipalityId} />
      <ErrorText message={error} />
      <button disabled={busy || !location.wardId}>{busy ? t('common.saving') : submitLabel}</button>
    </form>
  );
}
