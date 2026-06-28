import type { CandidateDetailSource } from '../../admin/candidates/detail';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

function formatDate(value: string | null): string {
  return value === null ? 'Not recorded' : `${dateFormatter.format(new Date(value))} UTC`;
}

function Field({ term, value }: { term: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{term}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value ?? 'Not recorded'}</dd>
    </div>
  );
}

export function CandidateSourcePanel({ source }: { source: CandidateDetailSource }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            {source.relationship}
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">{source.sourceName}</h3>
          <p className="mt-1 text-sm text-muted">{source.sourceType}</p>
        </div>
        <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-muted">
          {source.snapshot ? 'Snapshot verified' : 'Metadata only'}
        </span>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field term="Observed" value={formatDate(source.observedAt)} />
        <Field term="Published" value={formatDate(source.publishedAt)} />
        <Field term="Fetched" value={formatDate(source.fetchedAt)} />
        <Field term="License" value={source.license?.name ?? null} />
      </dl>
    </article>
  );
}
