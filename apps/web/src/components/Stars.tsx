'use client';

import { useI18n } from '@/lib/i18n';

/** Shows a 1 to 5 rating; with `onChange` it becomes a picker. */
export function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const { t } = useI18n();
  const full = Math.round(value);
  if (!onChange) {
    return (
      <span className="stars" aria-label={t('review.outOf', { n: value.toFixed(1) })}>
        {'★'.repeat(full)}
        <span className="stars-off">{'★'.repeat(5 - full)}</span>
      </span>
    );
  }
  return (
    <span className="stars picker" role="radiogroup" aria-label={t('review.rating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('review.outOf', { n: String(n) })}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}
