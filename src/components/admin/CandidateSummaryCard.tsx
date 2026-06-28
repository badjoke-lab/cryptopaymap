import type { CandidateQueueItem } from '../../admin/candidates/queue';

export function CandidateSummaryCard({ item }: { item: CandidateQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase text-muted">
            {item.candidateType} · {item.status}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{item.name}</h3>
        </div>
        <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-ink">
          Priority {item.priority === null ? 'Unscored' : item.priority}
        </span>
      </div>
      <p className="mt-4 text-sm text-muted">
        {item.sourceCount} source record{item.sourceCount === 1 ? '' : 's'}
      </p>
    </article>
  );
}
