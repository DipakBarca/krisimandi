'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorText, Field } from '@/components/Field';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type VerifyResult = { accessToken: string; refreshToken: string; isNewUser: boolean };

export default function LoginPage() {
  const { t, tError, lang } = useI18n();
  const { signIn } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(tError(e instanceof ApiError ? e.code : undefined));

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/request', { body: { phone, lang } });
      setStep('code');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<VerifyResult>('/auth/otp/verify', { body: { phone, code } });
      const me = await signIn(res);
      router.replace(me?.profileComplete ? '/' : '/onboarding');
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };

  return (
    <div className="narrow">
      <h1>{t('login.title')}</h1>
      {step === 'phone' ? (
        <form onSubmit={sendCode} className="stack">
          <Field label={t('login.phone')} hint={t('login.phoneHint')}>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98XXXXXXXX"
              required
            />
          </Field>
          <ErrorText message={error} />
          <button disabled={busy}>{busy ? t('common.loading') : t('login.send')}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack">
          <p className="muted">{t('login.sentTo', { phone })}</p>
          <Field label={t('login.code')}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
            />
          </Field>
          <ErrorText message={error} />
          <button disabled={busy}>{busy ? t('common.loading') : t('login.verify')}</button>
          <div className="row">
            <button type="button" className="link" onClick={() => setStep('phone')}>
              {t('login.changeNumber')}
            </button>
            <button type="button" className="link" onClick={() => sendCode()} disabled={busy}>
              {t('login.resend')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
