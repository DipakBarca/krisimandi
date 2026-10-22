'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ComplaintTargetLink } from '@/components/ComplaintTargetLink';
import { ErrorText, Field } from '@/components/Field';
import { api, apiBlob, ApiError } from '@/lib/api';
import { useApi, useRequireProfile, useUnits } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { AdminDoc, AdminStats, AdminUser, AuditEntry, Complaint, ComplaintStatus, Crop } from '@/lib/types';

const TABS = ['overview', 'verification', 'complaints', 'users', 'crops', 'audit'] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const { t } = useI18n();
  const me = useRequireProfile();
  const [tab, setTab] = useState<Tab>('overview');

  // Notifications link straight to a tab with ?tab=complaints.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (wanted && TABS.includes(wanted)) setTab(wanted);
  }, []);
  const choose = (k: Tab) => {
    setTab(k);
    window.history.replaceState(null, '', k === 'overview' ? '/admin' : `/admin?tab=${k}`);
  };

  if (!me) return <p className="muted">{t('common.loading')}</p>;
  if (!me.roles.includes('ADMIN')) return <p className="muted">{t('error.ROLE_REQUIRED')}</p>;

  return (
    <div className="stack">
      <h1>{t('admin.title')}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? '' : 'secondary'} onClick={() => choose(k)}>
            {t(`admin.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview go={choose} />}
      {tab === 'verification' && <Verification />}
      {tab === 'complaints' && <Complaints />}
      {tab === 'users' && <Users />}
      {tab === 'crops' && <Crops />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

/** Shared busy/error handling for admin actions. */
function useAction() {
  const { tError } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(tError(err instanceof ApiError ? err.code : undefined));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Overview({ go }: { go: (k: Tab) => void }) {
  const { t, num } = useI18n();
  const { data } = useApi<AdminStats>('/admin/stats');
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  const tiles: [string, number, Tab?][] = [
    [t('admin.stat.pendingDocs'), data.pendingDocs, 'verification'],
    [t('admin.stat.openComplaints'), data.openComplaints, 'complaints'],
    [t('admin.stat.farmers'), data.farmers, 'users'],
    [t('admin.stat.buyers'), data.buyers, 'users'],
    [t('admin.stat.suspended'), data.suspended, 'users'],
    [t('admin.stat.activeListings'), data.activeListings],
    [t('admin.stat.openOrders'), (data.orders.CONFIRMED ?? 0) + (data.orders.READY_FOR_PICKUP ?? 0) + (data.orders.PICKED_UP ?? 0)],
    [t('admin.stat.completedOrders'), data.orders.COMPLETED ?? 0],
    [t('admin.stat.cancelledOrders'), data.orders.CANCELLED ?? 0],
  ];
  return (
    <div className="tiles">
      {tiles.map(([label, value, target]) => (
        <button key={label} className="tile" disabled={!target} onClick={() => target && go(target)}>
          <span className="tile-value">{num(value)}</span>
          <span className="tile-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

function Verification() {
  const { t, date } = useI18n();
  const { data, refresh } = useApi<AdminDoc[]>('/admin/verification-docs');
  const { busy, error, run } = useAction();
  const view = (id: string) =>
    run(async () => {
      const blob = await apiBlob(`/admin/verification-docs/${id}/file`);
      window.open(URL.createObjectURL(blob), '_blank');
    });
  const decide = (id: string, status: 'APPROVED' | 'REJECTED') =>
    run(() => api(`/admin/verification-docs/${id}`, { method: 'PATCH', body: { status } })).then((ok) => ok && refresh());

  if (!data) return <p className="muted">{t('common.loading')}</p>;
  if (data.length === 0) return <p className="muted">{t('admin.docs.none')}</p>;
  return (
    <ul className="plain-list stack">
      {data.map((d) => (
        <li key={d.id} className="notice stack">
          <div>
            <Link href={`/users/${d.user.id}`}>{d.user.fullName}</Link> · {d.user.phone}
            {d.user.village && <span className="muted"> · {d.user.village}</span>}
          </div>
          <span className="small">
            {t(`profile.doc.${d.docType}`)} · <span className="muted">{date(d.createdAt, true)}</span>
          </span>
          <div className="row wrap">
            <button className="secondary" disabled={busy} onClick={() => view(d.id)}>{t('admin.docs.view')}</button>
            <button disabled={busy} onClick={() => decide(d.id, 'APPROVED')}>{t('admin.docs.approve')}</button>
            <button className="danger" disabled={busy} onClick={() => decide(d.id, 'REJECTED')}>{t('admin.docs.reject')}</button>
          </div>
        </li>
      ))}
      <ErrorText message={error} />
    </ul>
  );
}

function Complaints() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'' | ComplaintStatus>('');
  const { data, setData } = useApi<Complaint[]>(`/admin/complaints${status ? `?status=${status}` : ''}`);
  return (
    <div className="stack">
      <Field label={t('admin.complaints.show')}>
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | ComplaintStatus)}>
          <option value="">{t('admin.complaints.notClosed')}</option>
          {(['OPEN', 'FOLLOWING_UP', 'CLOSED'] as const).map((s) => (
            <option key={s} value={s}>{t(`report.status.${s}`)}</option>
          ))}
        </select>
      </Field>
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : data.length === 0 ? (
        <p className="muted">{t('admin.complaints.none')}</p>
      ) : (
        <ul className="plain-list stack">
          {data.map((c) => (
            <ComplaintItem key={c.id} c={c} onSaved={(u) => setData(data.map((x) => (x.id === u.id ? { ...x, ...u } : x)))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComplaintItem({ c, onSaved }: { c: Complaint; onSaved: (c: Complaint) => void }) {
  const { t, date } = useI18n();
  const [status, setStatus] = useState<ComplaintStatus>(c.status === 'OPEN' ? 'FOLLOWING_UP' : c.status);
  const [notes, setNotes] = useState(c.adminNotes ?? '');
  const { busy, error, run } = useAction();
  const save = (e: FormEvent) => {
    e.preventDefault();
    run(async () => onSaved(await api<Complaint>(`/admin/complaints/${c.id}`, { method: 'PATCH', body: { status, adminNotes: notes } })));
  };
  return (
    <li className="notice stack">
      <div className="row between">
        <ComplaintTargetLink c={c} admin />
        <span className={`badge ${c.status === 'CLOSED' ? 'badge-muted' : ''}`}>{t(`report.status.${c.status}`)}</span>
      </div>
      <p className="small">{c.reason}</p>
      <span className="muted small">
        {t('admin.complaints.by')} {c.filedBy?.fullName} ·{' '}
        {c.filedBy && <a href={`tel:${c.filedBy.phone}`}>{c.filedBy.phone}</a>} · {date(c.createdAt, true)}
        {c.handledBy && ` · ${t('admin.complaints.handledBy')} ${c.handledBy.fullName}`}
      </span>
      <form className="stack" onSubmit={save}>
        <Field label={t('report.adminNote')} hint={t('admin.complaints.noteHint')}>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
        </Field>
        <div className="row">
          <select value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus)}>
            {(['OPEN', 'FOLLOWING_UP', 'CLOSED'] as const).map((s) => (
              <option key={s} value={s}>{t(`report.status.${s}`)}</option>
            ))}
          </select>
          <button disabled={busy}>{t('admin.save')}</button>
        </div>
        <ErrorText message={error} />
      </form>
    </li>
  );
}

function Users() {
  const { t, date } = useI18n();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, setData } = useApi<AdminUser[]>(`/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const replace = (u: AdminUser) => data && setData(data.map((x) => (x.id === u.id ? u : x)));

  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} />
        <button>{t('admin.users.find')}</button>
      </form>
      <ErrorText message={error} />
      {!data ? (
        <p className="muted">{t('common.loading')}</p>
      ) : (
        <ul className="plain-list stack">
          {data.map((u) => (
            <li key={u.id} className="notice stack">
              <div className="row between">
                <span>
                  <Link href={`/users/${u.id}`}>{u.fullName}</Link> · {u.phone}
                  {u.isVerified && <span className="badge">✓</span>}
                </span>
                {u.isSuspended && <span className="badge badge-danger">{t('admin.users.suspended')}</span>}
              </div>
              <span className="muted small">
                {u.roles.map((r) => t(`role.${r}`)).join(' · ')}
                {u.village && ` · ${u.village}`} · {t('admin.users.joined')} {date(u.createdAt)} ·{' '}
                {t('admin.users.counts', { listings: u._count.listings, orders: u._count.buyerOrders + u._count.farmerOrders })}
              </span>
              {!u.roles.includes('ADMIN') &&
                (u.isSuspended ? (
                  <button className="secondary" disabled={busy} onClick={() => run(async () => replace(await api<AdminUser>(`/admin/users/${u.id}/unsuspend`, { method: 'POST' })))}>
                    {t('admin.users.unsuspend')}
                  </button>
                ) : suspending === u.id ? (
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        replace(await api<AdminUser>(`/admin/users/${u.id}/suspend`, { body: { reason: reason.trim() } }));
                        setSuspending(null);
                        setReason('');
                      });
                    }}
                  >
                    <Field label={t('admin.users.reason')} hint={t('admin.users.suspendHint')}>
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} minLength={3} maxLength={500} required />
                    </Field>
                    <div className="row">
                      <button className="danger" disabled={busy || reason.trim().length < 3}>{t('admin.users.suspend')}</button>
                      <button type="button" className="secondary" onClick={() => setSuspending(null)}>{t('common.cancel')}</button>
                    </div>
                  </form>
                ) : (
                  <button className="danger" onClick={() => { setSuspending(u.id); setReason(''); }}>{t('admin.users.suspend')}</button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORIES = ['vegetable', 'fruit', 'grain', 'pulse', 'spice', 'other'] as const;

function Crops() {
  const { t, name } = useI18n();
  const { data, refresh } = useApi<Crop[]>('/crops');
  const [editing, setEditing] = useState<Crop | 'new' | null>(null);
  if (!data) return <p className="muted">{t('common.loading')}</p>;
  return (
    <div className="stack">
      {editing === 'new' ? (
        <CropForm onDone={() => { setEditing(null); refresh(); }} />
      ) : (
        <button className="secondary" onClick={() => setEditing('new')}>+ {t('admin.crops.add')}</button>
      )}
      <ul className="plain-list">
        {data.map((c) =>
          editing !== 'new' && editing?.id === c.id ? (
            <li key={c.id}><CropForm crop={c} onDone={() => { setEditing(null); refresh(); }} /></li>
          ) : (
            <li key={c.id} className="row between crop-row">
              <span>
                {c.nameNe} · {c.nameEn} <span className="muted small">· {t(`admin.crops.cat.${c.category as (typeof CATEGORIES)[number]}`)} · {name(c.defaultUnit)}</span>
              </span>
              <button className="link small" onClick={() => setEditing(c)}>{t('admin.crops.edit')}</button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function CropForm({ crop, onDone }: { crop?: Crop; onDone: () => void }) {
  const { t, name } = useI18n();
  const units = useUnits();
  const [nameNe, setNameNe] = useState(crop?.nameNe ?? '');
  const [nameEn, setNameEn] = useState(crop?.nameEn ?? '');
  const [category, setCategory] = useState(crop?.category ?? 'vegetable');
  const [unitId, setUnitId] = useState<number | ''>(crop?.defaultUnitId ?? '');
  const { busy, error, run } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { nameNe: nameNe.trim(), nameEn: nameEn.trim(), category, defaultUnitId: Number(unitId) };
    run(() => (crop ? api(`/admin/crops/${crop.id}`, { method: 'PATCH', body }) : api('/admin/crops', { body }))).then((ok) => ok && onDone());
  };
  return (
    <form className="stack notice" onSubmit={submit}>
      <div className="row">
        <Field label={t('admin.crops.nameNe')}>
          <input value={nameNe} onChange={(e) => setNameNe(e.target.value)} maxLength={60} required />
        </Field>
        <Field label={t('admin.crops.nameEn')}>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} required />
        </Field>
      </div>
      <div className="row">
        <Field label={t('admin.crops.category')}>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`admin.crops.cat.${c}`)}</option>)}
          </select>
        </Field>
        <Field label={t('admin.crops.unit')}>
          <select value={unitId} onChange={(e) => setUnitId(Number(e.target.value))} required>
            <option value="" disabled />
            {units.map((u) => <option key={u.id} value={u.id}>{name(u)}</option>)}
          </select>
        </Field>
      </div>
      <div className="row">
        <button disabled={busy}>{t('admin.save')}</button>
        <button type="button" className="secondary" onClick={onDone}>{t('common.cancel')}</button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}

function Audit() {
  const { t, date } = useI18n();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [done, setDone] = useState(false);
  const load = async (before?: number) => {
    const page = await api<AuditEntry[]>(`/admin/audit${before ? `?before=${before}` : ''}`);
    setEntries((prev) => (before && prev ? [...prev, ...page] : page));
    setDone(page.length < 50);
  };
  useEffect(() => {
    load().catch(() => setEntries([]));
  }, []);
  if (!entries) return <p className="muted">{t('common.loading')}</p>;
  if (entries.length === 0) return <p className="muted">{t('admin.audit.none')}</p>;
  const summary = (e: AuditEntry) =>
    Object.entries(e.after ?? {})
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(', ');
  return (
    <div className="stack">
      <ul className="plain-list audit">
        {entries.map((e) => (
          <li key={e.id}>
            <b>{e.action}</b> <span className="muted small">{e.entity} {e.entityId.slice(0, 8)}</span>
            <div className="small">
              {e.actor?.fullName ?? t('admin.audit.system')} · {date(e.createdAt, true)}
            </div>
            {summary(e) && <div className="muted small">{summary(e)}</div>}
          </li>
        ))}
      </ul>
      {!done && (
        <button className="secondary" onClick={() => load(entries[entries.length - 1].id)}>
          {t('admin.audit.more')}
        </button>
      )}
    </div>
  );
}
