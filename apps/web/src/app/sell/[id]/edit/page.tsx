'use client';

import { useParams, useRouter } from 'next/navigation';
import { ListingForm } from '@/components/ListingForm';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Listing } from '@/lib/types';

export default function EditListingPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: listing } = useApi<Listing>(me ? `/listings/${id}` : null);
  if (!me || !listing) return <p className="muted">{t('common.loading')}</p>;
  return (
    <div className="narrow">
      <h1>{t('sell.edit')}</h1>
      <ListingForm me={me} listing={listing} onDone={(l) => router.replace(`/listings/${l.id}`)} />
    </div>
  );
}
