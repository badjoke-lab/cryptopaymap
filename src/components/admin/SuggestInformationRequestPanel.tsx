import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { suggestSubmissionReviewDetailResponseSchema } from '../../admin/submissions/detail';
import { suggestInformationRequestReceiptSchema } from '../../admin/submissions/information-request';
import { Button } from '../ui/Button';

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; submissionId: string; updatedAt: string }
  | { status: 'not_applicable'; workflowStatus: string }
  | { status: 'submitting'; submissionId: string; updatedAt: string }
  | { status: 'success'; replayed: boolean }
  | { status: 'conflict' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'hidden' };

export function SuggestInformationRequestPanel() {
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [requestedAction, setRequestedAction] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const submissionId =
    typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('id');

  const loadDetail = useCallback(async () => {
    if (!submissionId) {
      setState({ status: 'hidden' });
      return;
    }
    try {
      const response = await fetch(`/admin/api/submissions/${encodeURIComponent(submissionId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 403) {
        setState({ status: 'denied' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'unavailable' });
        return;
      }
      const result = suggestSubmissionReviewDetailResponseSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'unavailable' });
        return;
      }
      if (result.data.submission.workflowStatus !== 'in_review') {
        setState({
          status: 'not_applicable',
          workflowStatus: result.data.submission.workflowStatus,
        });
        return;
      }
      setState({
        status: 'ready',
        submissionId: result.data.submission.id,
        updatedAt: result.data.submission.updatedAt,
      });
    } catch {
      setState({ status: 'unavailable' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function submitInformationRequest(activeSubmissionId: string, expectedUpdatedAt: string) {
    setState({
      status: 'submitting',
      submissionId: activeSubmissionId,
      updatedAt: expectedUpdatedAt,
    });
    try {
      const response = await fetch(
        `/admin/api/submissions/${encodeURIComponent(activeSubmissionId)}/request-information`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'suggest-information-request-v1',
            requestId: crypto.randomUUID(),
            expectedStatus: 'in_review',
            expectedUpdatedAt,
            requestedAction,
            publicMessage,
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
      const result = suggestInformationRequestReceiptSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'unavailable' });
        return;
      }
      setState({ status: 'success', replayed: result.data.state === 'replayed' });
      await loadDetail();
    } catch {
      setState({ status: 'unavailable' });
    }
  }

  if (state.status === 'hidden') return null;
  if (state.status === 'loading') {
    return <p className="m-0 text-sm text-muted">Loading information-request boundary…</p>;
  }
  if (state.status === 'denied') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-error">
        <ShieldAlert className="size-4" aria-hidden="true" />
        Information-request access is denied.
      </p>
    );
  }
  if (state.status === 'conflict') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-stale">
        <AlertTriangle className="size-4" aria-hidden="true" />
        The Submission changed before this request could commit. Reload the review before trying
        again.
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-stale">
        <AlertTriangle className="size-4" aria-hidden="true" />
        The information-request boundary could not be verified safely.
      </p>
    );
  }
  if (state.status === 'success') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-confirmed">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {state.replayed
          ? 'The identical information request was replayed safely.'
          : 'The information request was committed and is now available through private status.'}
      </p>
    );
  }
  if (state.status === 'not_applicable') {
    return (
      <p className="m-0 text-sm text-muted">
        Information requests are available only from in review. Current status:{' '}
        {state.workflowStatus.replaceAll('_', ' ')}.
      </p>
    );
  }

  const activeSubmissionId = state.submissionId;
  const expectedUpdatedAt = state.updatedAt;
  const canSubmit =
    state.status === 'ready' &&
    requestedAction.trim().length > 0 &&
    publicMessage.trim().length > 0;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        void submitInformationRequest(activeSubmissionId, expectedUpdatedAt);
      }}
    >
      <label className="grid gap-2 text-sm font-medium text-ink">
        Requested action
        <textarea
          className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
          maxLength={500}
          required
          value={requestedAction}
          onChange={(event) => setRequestedAction(event.currentTarget.value)}
          placeholder="Describe exactly what the submitter should provide."
        />
      </label>
      <label className="grid gap-2 text-sm font-medium text-ink">
        Public status message
        <textarea
          className="min-h-28 rounded-control border border-border bg-surface px-3 py-2 font-normal"
          maxLength={1_000}
          required
          value={publicMessage}
          onChange={(event) => setPublicMessage(event.currentTarget.value)}
          placeholder="Explain why the additional information is needed without exposing private reviewer notes."
        />
      </label>
      <div>
        <Button type="submit" disabled={!canSubmit}>
          Request information
        </Button>
      </div>
    </form>
  );
}
