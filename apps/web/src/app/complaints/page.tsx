'use client';

import { ComplaintTargetLink } from '@/components/ComplaintTargetLink';
import { useApi, useRequireProfile } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { Complaint } from '@/lib/types';

/** Problems I have reported and what the admin said back. */
export default function ComplaintsPage() {
  const { t, date } = useI18n();
  const me = useRequireProfile();
  const { data } = useApi<Complaint[]>(me ? '/me/complaints' : null);
  return (
    <div className="stack narrow">
      <h1>{t('report.mine')}</h1>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="muted">{t('report.none')}</p>
      ) : (
        <ul className="plain-list stack">
          {data.map((c) => (
            <li key={c.id} className="notice stack">
              <div className="row between">
                <ComplaintTargetLink c={c} />
                <span className={`badge ${c.status === 'CLOSED' ? 'badge-muted' : ''}`}>{t(`report.status.${c.status}`)}</span>
              </div>
              <p className="small">{c.reason}</p>
              {c.adminNotes && (
                <p className="small">
                  <b>{t('report.adminNote')}:</b> {c.adminNotes}
                </p>
              )}
              <span className="muted small">{date(c.createdAt, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
