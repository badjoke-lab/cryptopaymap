import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { SubmissionWorkflowStatus } from '../../submissions/contract';
import { suggestReviewTransitionReceiptSchema } from '../../admin/submissions/transitions';
import { Button } from '../ui/Button';

type TransitionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; replayed: boolean }
  | { status: 'conflict' }
  | { status: 'denied' }
  | { status: 'error' };

export interface SuggestReviewTransitionControlsProps {
  submissionId: string;
  workflowStatus: SubmissionWorkflowStatus;
  updatedAt: string;
  onCommitted: () => void | Promise<void>;
}

const actionByStatus = {
  received: {
    action: 'begin_triage',
    label: 'Start triage',
    nextStatus: 'triage',
  },
  triage: {
    action: 'begin_review',
    label: 'Begin review',
    nextStatus: 'in review',
  },
} as const;

export function SuggestReviewTransitionControls({
  submissionId,
  workflowStatus,
  updatedAt,
  onCommitted,
}: SuggestReviewTransitionControlsProps) {
  const [state, setState] = useState<TransitionState>({ status: 'idle' });
  const specification =
    workflowStatus === 'received' || workflowStatus === 'triage'
      ? actionByStatus[workflowStatus]
      : null;

  if (specification === null) {
    return (
      <p className="m-0 text-sm text-muted">
        This slice provides no transition action for the current workflow status.
      </p>
    );
  }
  const activeSpecification = specification;

  async function submitTransition() {
    setState({ status: 'submitting' });
    try {
      const response = await fetch(
        `/admin/api/submissions/${encodeURIComponent(submissionId)}/transition`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schemaVersion: 'suggest-review-transition-v1',
            requestId: crypto.randomUUID(),
            action: activeSpecification.action,
            expectedStatus: workflowStatus,
            expectedUpdatedAt: updatedAt,
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
        setState({ status: 'error' });
        return;
      }

      const result = suggestReviewTransitionReceiptSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'success', replayed: result.data.state === 'replayed' });
      await onCommitted();
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={state.status === 'submitting'} onClick={() => void submitTransition()}>
          {state.status === 'submitting' ? 'Applying transition…' : activeSpecification.label}
        </Button>
        <span className="text-sm text-muted">
          {workflowStatus.replaceAll('_', ' ')} → {activeSpecification.nextStatus}
        </span>
      </div>

      {state.status === 'success' ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-status-confirmed">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {state.replayed
            ? 'The identical transition request was replayed safely.'
            : 'The guarded transition was committed.'}
        </p>
      ) : null}
      {state.status === 'conflict' ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-status-stale">
          <AlertTriangle className="size-4" aria-hidden="true" />
          The Submission changed before this action could commit. Reload the review before trying
          again.
        </p>
      ) : null}
      {state.status === 'denied' ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-status-error">
          <AlertTriangle className="size-4" aria-hidden="true" />
          Your verified identity does not have the Submission transition capability.
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-status-error">
          <AlertTriangle className="size-4" aria-hidden="true" />
          The transition could not be verified. The current review state was not changed locally.
        </p>
      ) : null}
    </div>
  );
}
