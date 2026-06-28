import type { CandidateQueueItem } from '../../admin/candidates/queue';

export function CandidateSummaryCard({ item }: { item: CandidateQueueItem }) {
  return (
    <article>
      <h3>{item.name}</h3>
    </article>
  );
}
