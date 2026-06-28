import { useCallback, useEffect, useState } from 'react';
import {
  candidateDuplicateReviewResponseSchema,
  type CandidateDuplicateReviewResponse,
} from '../../admin/candidates/duplicate-review';
import { Button } from '../ui/Button';
import { DuplicateReviewDecisionForm } from './DuplicateReviewDecisionForm';

function humanize(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; review: CandidateDuplicateReviewResponse }
  | { status: 'missing' | 'denied' | 'not_found' | 'unavailable' | 'error' };

export function CandidateDuplicateReview() {
  const [groupId, setGroupId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [primaryCandidateId, setPrimaryCandidateId] = useState('');

  useEffect(() => {
    setGroupId(new URLSearchParams(window.location.search).get('group'));
  }, []);

  const loadReview = useCallback(async (signal?: AbortSignal) => {
    if (groupId === undefined) return;
    if (!groupId) return setState({ status: 'missing' });
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/duplicates/${encodeURIComponent(groupId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) return setState({ status: 'denied' });
      if (response.status === 404) return setState({ status: 'not_found' });
      if (response.status === 400) return setState({ status: 'missing' });
      if (response.status === 503) return setState({ status: 'unavailable' });
      if (!response.ok) return setState({ status: 'error' });
      const parsed = candidateDuplicateReviewResponseSchema.safeParse(await response.json());
      if (!parsed.success) return setState({ status: 'error' });
      setPrimaryCandidateId(parsed.data.members[0]?.id ?? '');
      setState({ status: 'ready', review: parsed.data });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    }
  }, [groupId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReview(controller.signal);
    return () => controller.abort();
  }, [loadReview]);

  if (state.status === 'loading') {
    return (
      <p className="rounded-card border border-border bg-surface p-6 text-sm text-muted">
        Loading review…
      </p>
    );
  }
  if (state.status !== 'ready') {
    const message = {
      missing: 'A duplicate-group identifier is required.',
      denied: 'This identity cannot read the group.',
      not_found: 'The group was not found.',
      unavailable: 'The review service is unavailable.',
      error: 'The response could not be verified.',
    }[state.status];
    return (
      <section className="rounded-card border border-border bg-surface p-6">
        <h2 className="m-0 text-xl font-semibold text-ink">Duplicate review unavailable</h2>
        <p className="mt-2 text-sm text-muted">{message}</p>
        {state.status === 'unavailable' || state.status === 'error' ? (
          <Button className="mt-5" variant="secondary" onClick={() => void loadReview()}>
            Retry review
          </Button>
        ) : null}
      </section>
    );
  }

  const { review } = state;
  const isOpen = review.group.status === 'open';
  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/candidates/">
        ← Back to Candidate queue
      </a>
      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase text-brand-700">
          Protected duplicate group
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">
          {review.members.length} Candidate records
        </h2>
        <p className="mt-2 break-all text-xs text-muted">
          {review.group.id} · {humanize(review.group.status)}
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-2xl font-semibold text-ink">Candidate comparison</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {review.members.map((member) => (
            <article
              key={member.id}
              className="rounded-card border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {isOpen ? (
                  <input
                    type="radio"
                    name="primary-candidate"
                    checked={primaryCandidateId === member.id}
                    onChange={() => setPrimaryCandidateId(member.id)}
                    className="mt-1 size-5"
                    aria-label={`Select ${member.name} as primary Candidate`}
                  />
                ) : null}
                <div>
                  <h3 className="m-0 text-lg font-semibold text-ink">{member.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {humanize(member.status)} · {member.sourceCount} sources
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted">
                {member.sourceTypes.map(humanize).join(', ') || 'No source types'}
              </p>
              <a
                className="mt-4 inline-flex text-sm font-semibold text-brand-700"
                href={`/admin/candidates/detail/?id=${encodeURIComponent(member.id)}`}
              >
                Open Candidate detail
              </a>
            </article>
          ))}
        </div>
      </section>
      <section className="mt-8 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="m-0 text-xl font-semibold text-ink">Persisted signals</h2>
        <ul className="mt-4 grid gap-3 p-0">
          {review.signals.map((signal) => (
            <li
              key={signal.id}
              className="list-none rounded-control border border-border bg-canvas p-4 text-sm text-ink"
            >
              {humanize(signal.reason)} · {humanize(signal.strength)}
            </li>
          ))}
        </ul>
        {review.signalsTruncated ? (
          <p className="mt-3 text-sm text-amber-900">Only the first 100 signals are shown.</p>
        ) : null}
      </section>
      {isOpen ? (
        <DuplicateReviewDecisionForm
          review={review}
          primaryCandidateId={primaryCandidateId}
          onCommitted={() => loadReview()}
        />
      ) : (
        <p className="mt-8 rounded-card border border-border bg-canvas p-5 text-sm text-muted">
          This group is closed. No further decision control is displayed.
        </p>
      )}
    </div>
  );
}
