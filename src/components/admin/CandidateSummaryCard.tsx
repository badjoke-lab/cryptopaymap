import type { CandidateQueueItem } from '../../admin/candidates/queue';

export function CandidateSummaryCard({ item }: { item: CandidateQueueItem }) {
  const detailHref = '/admin/candidates/detail/?id=' + item.id;
  const promotionHref = '/admin/candidates/promotion/?id=' + item.id;
  const promotionAvailable =
    ['physical_place', 'online_service'].includes(item.candidateType) &&
    ['new', 'triaged'].includes(item.status) &&
    !item.linkedToCanonical;
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase text-muted">
            {item.candidateType} · {item.status}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">
            <a className="text-ink no-underline hover:text-brand-700" href={detailHref}>
              {item.name}
            </a>
          </h3>
        </div>
        <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-ink">
          Priority {item.priority === null ? 'Unscored' : item.priority}
        </span>
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="font-semibold text-ink">Sources</dt>
          <dd className="mt-1 text-muted">
            {item.sourceTypes.length === 0 ? 'None' : item.sourceTypes.join(', ')} ·{' '}
            {item.sourceCount} record{item.sourceCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Last seen</dt>
          <dd className="mt-1 text-muted">{item.lastSeenAt.slice(0, 10)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Duplicate signal</dt>
          <dd className="mt-1 text-muted">
            {item.duplicateSignal ? (item.duplicateGroupStatus ?? 'flagged') : 'Not flagged'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Linked record</dt>
          <dd className="mt-1 text-muted">{item.linkedToCanonical ? 'Linked' : 'Not linked'}</dd>
        </div>
      </dl>
      {promotionAvailable ? (
        <a className="mt-5 inline-flex text-sm font-semibold text-brand-700" href={promotionHref}>
          Open promotion editor
        </a>
      ) : null}
    </article>
  );
}
