import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { suggestAcceptedCandidateReceiptSchema } from '../../admin/submissions/accepted-candidate';
import { suggestSubmissionReviewDetailResponseSchema } from '../../admin/submissions/detail';
import { Button } from '../ui/Button';

type ReasonCode =
  | 'useful_but_incomplete'
  | 'insufficient_evidence'
  | 'identity_needs_review'
  | 'payment_details_incomplete'
  | 'other';

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; submissionId: string; updatedAt: string }
  | { status: 'not_applicable'; workflowStatus: string; resolution: string | null }
  | { status: 'submitting'; submissionId: string; updatedAt: string }
  | { status: 'success'; replayed: boolean; candidateId: string }
  | { status: 'conflict' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'hidden' };

export function SuggestAcceptedCandidatePanel() {
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [reasonCode, setReasonCode] = useState<ReasonCode>('useful_but_incomplete');
  const [note, setNote] = useState('');
  const submissionId =
    typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('id');

  const loadDetail = useCallback(async () => {
    if (!submissionId) {
      setState({ status: 'hidden' });
      return null;
    }
    try {
      const response = await fetch(`/admin/api/submissions/${encodeURIComponent(submissionId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 403) {
        setState({ status: 'denied' });
        return null;
      }
      if (!response.ok) {
        setState({ status: 'unavailable' });
        return null;
      }
      const result = suggestSubmissionReviewDetailResponseSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'unavailable' });
        return null;
      }
      if (result.data.submission.workflowStatus !== 'in_review') {
        setState({
          status: 'not_applicable',
          workflowStatus: result.data.submission.workflowStatus,
          resolution: result.data.submission.resolution,
        });
        return result.data;
      }
      setState({
        status: 'ready',
        submissionId: result.data.submission.id,
        updatedAt: result.data.submission.updatedAt,
      });
      return result.data;
    } catch {
      setState({ status: 'unavailable' });
      return null;
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function submitAcceptance(activeSubmissionId: string, expectedUpdatedAt: string) {
    setState({
      status: 'submitting',
      submissionId: activeSubmissionId,
      updatedAt: expectedUpdatedAt,
    });
    try {
      const response = await fetch(
        `/admin/api/submissions/${encodeURIComponent(activeSubmissionId)}/accept-candidate`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'suggest-accepted-candidate-v1',
            requestId: crypto.randomUUID(),
            expectedStatus: 'in_review',
            expectedUpdatedAt,
            reasonCode,
            note: note.trim().length === 0 ? null : note,
          }),
        },
      );
      if (response.status === 403) {
        setState({ status: 'denied' });
        return;
      }
      if (response.status === 409) {
        setState({ status: 'conflict' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'unavailable' });
        return;
      }
      const result = suggestAcceptedCandidateReceiptSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'unavailable' });
        return;
      }

      const detailResponse = await fetch(
        `/admin/api/submissions/${encodeURIComponent(activeSubmissionId)}`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
      if (!detailResponse.ok) {
        setState({ status: 'unavailable' });
        return;
      }
      const detailResult = suggestSubmissionReviewDetailResponseSchema.safeParse(
        await detailResponse.json(),
      );
      if (
        !detailResult.success ||
        detailResult.data.submission.workflowStatus !== 'resolved' ||
        detailResult.data.submission.resolution !== 'accepted_as_candidate'
      ) {
        setState({ status: 'unavailable' });
        return;
      }
      setState({
        status: 'success',
        replayed: result.data.state === 'replayed',
        candidateId: result.data.candidateId,
      });
    } catch {
      setState({ status: 'unavailable' });
    }
  }

  if (state.status === 'hidden') return null;
  if (state.status === 'loading') {
    return <p className="m-0 text-sm text-muted">Loading Candidate decision boundary…</p>;
  }
  if (state.status === 'denied') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-error">
        <ShieldAlert className="size-4" aria-hidden="true" />
        Accepted-as-Candidate access is denied.
      </p>
    );
  }
  if (state.status === 'conflict') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-stale">
        <AlertTriangle className="size-4" aria-hidden="true" />
        The Submission or normalized proposal changed before Candidate creation could commit. Reload the review before trying again.
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-stale">
        <AlertTriangle className="size-4" aria-hidden="true" />
        The Candidate creation boundary could not be verified safely.
      </p>
    );
  }
  if (state.status === 'success') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-confirmed">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {state.replayed
          ? 'The identical accepted-as-Candidate decision was replayed safely.'
          : 'The Suggest submission was accepted as a private Candidate.'}{' '}
        Candidate {state.candidateId.slice(0, 8)}… is ready for normal Candidate review.
      </p>
    );
  }
  if (state.status === 'not_applicable') {
    return (
      <p className="m-0 text-sm text-muted">
        Candidate acceptance is available only from in review. Current status:{' '}
        {state.workflowStatus.replaceAll('_', ' ')}
        {state.resolution ? ` · ${state.resolution.replaceAll('_', ' ')}` : ''}.
      </p>
    );
  }

  const activeSubmissionId = state.submissionId;
  const expectedUpdatedAt = state.updatedAt;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submitAcceptance(activeSubmissionId, expectedUpdatedAt);
      }}
    >
      <label className="grid gap-2 text-sm font-medium text-ink">
        Decision reason
        <select
          className="min-h-11 rounded-control border border-border bg-surface px-3 py-2 font-normal"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.currentTarget.value as ReasonCode)}
        >
          <option value="useful_but_incomplete">Useful but incomplete</option>
          <option value="insufficient_evidence">Insufficient evidence</option>
          <option value="identity_needs_review">Identity needs review</option>
          <option value="payment_details_incomplete">Payment details incomplete</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium text-ink">
        Internal decision note (optional)
        <textarea
          className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
          maxLength={1_000}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder="Explain why the Suggest should remain private review material rather than become canonical truth."
        />
      </label>
      <div>
        <Button type="submit">Accept as private Candidate</Button>
      </div>
    </form>
  );
}
