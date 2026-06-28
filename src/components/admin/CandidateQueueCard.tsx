import { AlertTriangle, Clock3, Link2, Tags } from 'lucide-react';
import type { CandidateQueueItem } from '../../admin/candidates/queue';

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export function humanizeCandidateValue(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function CandidateQueueCard({ item }: { item: CandidateQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            <span>{humanizeCandidateValue(item.candidateType)}</span>
            <span aria-hidden="true">·</span>
            <span>{humanizeCandidateValue(item.status)}</span>
          </div>
          <h3 className="mt-2 break-words text-lg font-semibold tracking-tight text-ink">
            {item.name}
          </h3>
        </div>
        <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-ink">
          Priority {item.priority === null ? 'Unscored' : numberFormatter.format(item.priority)}
        </span>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="flex items-center gap-2 font-semibold text-ink">
            <Tags className="size-4 text-brand-700" aria-hidden="true" />
            Sources
          </dt>
          <dd className="mt-1 text-muted">
            {item.sourceTypes.length === 0
              ? 'No source summary'
              : item.sourceTypes.map(humanizeCandidateValue).join(', ')}
            {` · ${numberFormatter.format(item.sourceCount)} record${item.sourceCount === 1 ? '' : 's'}`}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-semibold text-ink">
            <Clock3 className="size-4 text-brand-700" aria-hidden="true" />
            Last seen
          </dt>
          <dd className="mt-1 text-muted">
            {dateFormatter.format(new Date(item.lastSeenAt))} UTC
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-semibold text-ink">
            <AlertTriangle className="size-4 text-brand-700" aria-hidden="true" />
            Duplicate signal
          </dt>
          <dd className="mt-1 text-muted">
            {item.duplicateSignal
              ? humanizeCandidateValue(item.duplicateGroupStatus ?? 'flagged')
              : 'Not flagged'}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 font-semibold text-ink">
            <Link2 className="size-4 text-brand-700" aria-hidden="true" />
            Canonical link
          </dt>
          <dd className="mt-1 text-muted">{item.linkedToCanonical ? 'Linked' : 'Not linked'}</dd>
        </div>
      </dl>
    </article>
  );
}
