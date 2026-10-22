'use client';

import { useRouter } from 'next/navigation';
import { ListingForm } from '@/components/ListingForm';
import { useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function NewListingPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const router = useRouter();
  if (!me) return <p className="muted">{t('common.loading')}</p>;
  if (!me.roles.includes('FARMER')) return <p>{t('sell.needFarmer')}</p>;
  return (
    <div className="narrow">
      <h1>{t('sell.new')}</h1>
      <ListingForm me={me} onDone={(l) => router.replace(`/listings/${l.id}`)} />
    </div>
  );
}
