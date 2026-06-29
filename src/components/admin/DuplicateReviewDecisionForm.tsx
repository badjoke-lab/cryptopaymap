import { useState } from 'react';
import type { CandidateDuplicateReviewResponse } from '../../admin/candidates/duplicate-review';
import { Button } from '../ui/Button';

const confirmReasons = [
  ['same_osm_identity', 'Same OSM identity'],
  ['same_physical_location', 'Same physical location'],
  ['same_official_domain', 'Same official domain'],
  ['same_online_service', 'Same online service'],
  ['manual_match', 'Manual match'],
] as const;
const dismissReasons = [
  ['different_location', 'Different location'],
  ['different_business', 'Different business'],
  ['different_service', 'Different service'],
  ['insufficient_evidence', 'Insufficient evidence'],
  ['stale_signal', 'Stale signal'],
  ['other', 'Other'],
] as const;

type SubmitState = 'idle' | 'submitting' | 'success' | 'conflict' | 'denied' | 'failed';

export function DuplicateReviewDecisionForm({
  review,
  primaryCandidateId,
  onCommitted,
}: {
  review: CandidateDuplicateReviewResponse;
  primaryCandidateId: string;
  onCommitted: () => Promise<void>;
}) {
  const [action, setAction] = useState<'confirm_duplicate' | 'dismiss_signal'>(
    'confirm_duplicate',
  );
  const [reasonCode, setReasonCode] = useState('same_osm_identity');
  const [note, setNote] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const reasons = action === 'confirm_duplicate' ? confirmReasons : dismissReasons;

  async function submit() {
    setState('submitting');
    try {
      const response = await fetch(`/admin/api/duplicates/${encodeURIComponent(review.group.id)}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          action,
          primaryCandidateId: action === 'confirm_duplicate' ? primaryCandidateId : null,
          memberCandidateIds: review.members.map((member) => member.id),
          reasonCode,
          note: note.trim() || null,
          expectedGroupUpdatedAt: review.group.updatedAt,
        }),
      });
      if (response.status === 403) return setState('denied');
      if (response.status === 409) return setState('conflict');
      if (!response.ok) return setState('failed');
      setState('success');
      await onCommitted();
    } catch {
      setState('failed');
    }
  }

  return (
    <section
      className="mt-8 rounded-card border border-brand-600 bg-brand-50 p-5"
      aria-labelledby="duplicate-decision-title"
    >
      <h2 id="duplicate-decision-title" className="m-0 text-xl font-semibold text-ink">
        Explicit review decision
      </h2>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant={action === 'confirm_duplicate' ? 'primary' : 'secondary'}
          onClick={() => {
            setAction('confirm_duplicate');
            setReasonCode('same_osm_identity');
            setState('idle');
          }}
        >
          Confirm duplicate
        </Button>
        <Button
          variant={action === 'dismiss_signal' ? 'danger' : 'secondary'}
          onClick={() => {
            setAction('dismiss_signal');
            setReasonCode('different_business');
            setState('idle');
          }}
        >
          Dismiss signal
        </Button>
      </div>

      <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="duplicate-reason">
        Reason
      </label>
      <select
        id="duplicate-reason"
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink"
      >
        {reasons.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <label className="mt-5 block text-sm font-semibold text-ink" htmlFor="duplicate-note">
        Internal decision note
      </label>
      <textarea
        id="duplicate-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={2_000}
        rows={4}
        className="mt-2 w-full rounded-control border border-border bg-surface p-3 text-sm text-ink"
      />

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button
          variant={action === 'confirm_duplicate' ? 'primary' : 'danger'}
          loading={state === 'submitting'}
          disabled={action === 'confirm_duplicate' && !primaryCandidateId}
          onClick={() => void submit()}
        >
          Commit decision
        </Button>
        <p className="m-0 text-sm text-muted">No row merge, promotion, or publication occurs.</p>
      </div>

      {state === 'success' ? (
        <p className="mt-4 text-sm font-semibold text-brand-800" role="status">
          Decision committed.
        </p>
      ) : null}
      {state === 'conflict' ? (
        <p className="mt-4 text-sm font-semibold text-danger" role="alert">
          The group changed. Reload before deciding again.
        </p>
      ) : null}
      {state === 'denied' ? (
        <p className="mt-4 text-sm font-semibold text-danger" role="alert">
          This identity cannot resolve duplicates.
        </p>
      ) : null}
      {state === 'failed' ? (
        <p className="mt-4 text-sm font-semibold text-danger" role="alert">
          The decision was not committed.
        </p>
      ) : null}
    </section>
  );
}
