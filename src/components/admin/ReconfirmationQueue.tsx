import { useEffect, useState } from 'react';
import {
  protectedReconfirmationQueueResponseSchema,
  type ProtectedReconfirmationQueueItem,
} from '../../admin/reconfirmation/protected-workspace';

export function ReconfirmationQueue() {
  const [items, setItems] = useState<ProtectedReconfirmationQueueItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/admin/api/rechecks?dueSoonDays=30&limit=50', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('queue');
        const parsed = protectedReconfirmationQueueResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('schema');
        setItems(parsed.data.items);
      })
      .catch((reason) => {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
      });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert">Rechecks queue unavailable.</p>;
  if (items === null) return <p>Loading Rechecks queue…</p>;
  if (items.length === 0) return <p>No Claims require review.</p>;

  return (
    <section aria-labelledby="rechecks-results-title">
      <h2 id="rechecks-results-title" className="text-2xl font-semibold text-ink">Reconfirmation Claims</h2>
      <div className="mt-5 grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-brand-700">{item.queueReason.replaceAll('_', ' ')}</p>
            <h3 className="mt-2 text-lg font-semibold text-ink">{item.entityName}</h3>
            <p className="mt-1 text-sm text-muted">{item.locationName ?? item.entityType}</p>
            <p className="mt-3 text-sm text-muted">Deadline: {item.dueAt ?? 'Missing'}</p>
            <a className="mt-4 inline-flex min-h-11 items-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-brand-700" href={`/admin/rechecks/detail/?id=${encodeURIComponent(item.id)}`}>Review Claim</a>
          </article>
        ))}
      </div>
    </section>
  );
}
