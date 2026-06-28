import type { CandidateQueueItem } from '../../admin/candidates/queue';

export function CandidateSummaryCard({ item }: { item: CandidateQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <p className="m-0 text-xs font-semibold uppercase text-muted">{item.candidateType}</p>
      <h3 className="mt-2 text-lg font-semibold text-ink">{item.name}</h3>
    </article>
  );
}
