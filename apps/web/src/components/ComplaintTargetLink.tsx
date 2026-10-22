'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { Complaint } from '@/lib/types';

/** Names what a complaint is about, with a link where the viewer can open it. */
export function ComplaintTargetLink({ c, admin }: { c: Complaint; admin?: boolean }) {
  const { t, name } = useI18n();
  const target = c.target;
  const label = t(`report.target.${c.targetType}`);
  if (!target) return <span>{label}</span>;
  if (c.targetType === 'USER') return <span>{label}: <Link href={`/users/${target.id}`}>{target.fullName}</Link></span>;
  if (c.targetType === 'LISTING') {
    return (
      <span>
        {label}: <Link href={`/listings/${target.id}`}>{name(target.crop)}</Link> · {target.farmer?.fullName}
      </span>
    );
  }
  const crop = name(target.listing?.crop);
  return (
    <span>
      {label}: {admin ? crop : <Link href={`/orders/${target.id}`}>{crop}</Link>} · {target.farmer?.fullName} → {target.buyer?.fullName}
    </span>
  );
}
