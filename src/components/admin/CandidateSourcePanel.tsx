import type { CandidateDetailSource } from '../../admin/candidates/detail';

export function CandidateSourcePanel({ source }: { source: CandidateDetailSource }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
        {source.relationship}
      </p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight text-ink">{source.sourceName}</h3>
      <p className="mt-1 text-sm text-muted">{source.sourceType}</p>
    </article>
  );
}
