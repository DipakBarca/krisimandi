'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ProfileForm } from '@/components/ProfileForm';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function OnboardingPage() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (!me) return <p className="muted">{t('common.loading')}</p>;
  return (
    <div className="narrow">
      <h1>{t('onboarding.title')}</h1>
      <ProfileForm me={me} submitLabel={t('onboarding.save')} onSaved={(roles) => router.replace(roles.includes('FARMER') ? '/sell' : '/')} />
    </div>
  );
}
