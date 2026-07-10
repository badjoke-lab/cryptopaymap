import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  suggestSubmissionReviewDetailResponseSchema,
  type SuggestSubmissionReviewDetailResponse,
} from '../../admin/submissions/detail';
import { SuggestReviewTransitionControls } from './SuggestReviewTransitionControls';

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; detail: SuggestSubmissionReviewDetailResponse }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'hidden' };

export function SuggestReviewTransitionPanel() {
  const [state, setState] = useState<PanelState>({ status: 'loading' });
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
      setState(
        result.success ? { status: 'ready', detail: result.data } : { status: 'unavailable' },
      );
    } catch {
      setState({ status: 'unavailable' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (state.status === 'hidden') return null;
  if (state.status === 'loading') {
    return <p className="m-0 text-sm text-muted">Loading guarded review actions…</p>;
  }
  if (state.status === 'denied') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-error">
        <ShieldAlert className="size-4" aria-hidden="true" />
        Submission review detail access is denied.
      </p>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-status-stale">
        <AlertTriangle className="size-4" aria-hidden="true" />
        Guarded review actions are unavailable because the current Submission state could not be
        verified.
      </p>
    );
  }

  return (
    <SuggestReviewTransitionControls
      submissionId={state.detail.submission.id}
      workflowStatus={state.detail.submission.workflowStatus}
      updatedAt={state.detail.submission.updatedAt}
      onCommitted={loadDetail}
    />
  );
}
