'use client';

import { useI18n } from '@/lib/i18n';
import { DocName, pages } from '@/lib/pages';

export function Prose({ name }: { name: DocName }) {
  const { lang } = useI18n();
  const doc = pages[name][lang];
  return (
    <article className="prose stack">
      <h1>{doc.title}</h1>
      <p>{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.body && <p>{s.body}</p>}
          {s.items && (
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
