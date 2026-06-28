import type { CandidateDetailSource } from '../../admin/candidates/detail';

export function CandidateSourcePanel({ source }: { source: CandidateDetailSource }) {
  return (
    <article>
      <h3>{source.sourceName}</h3>
    </article>
  );
}
