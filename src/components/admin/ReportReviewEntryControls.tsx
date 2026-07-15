import { AlertTriangle, CheckCircle2, PlayCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  reportSubmissionReviewDetailResponseSchema,
  type ReportSubmissionReviewDetailResponse,
} from '../../admin/submissions/report-detail';
import {
  reviewEntryReceiptSchema,
  reviewEntryRequestSchema,
  type ReviewEntryReceipt,
  type ReviewEntryRequest,
} from '../../admin/submissions/review-entry';
import { Button } from '../ui/Button';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: ReportSubmissionReviewDetailResponse }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

type MutationState =
  | { status: 'idle' }
  | { status: 'submitting'; request: ReviewEntryRequest }
  | { status: 'failed'; request: ReviewEntryRequest; message: string }
  | { status: 'committed'; receipt: ReviewEntryReceipt };

function StatusPanel({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="rounded-card border border-border bg-surface p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-control bg-canvas text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

function nextAction(detail: ReportSubmissionReviewDetailResponse): {
  action: 'begin_triage' | 'begin_review';
  expectedStatus: 'received' | 'triage';
  label: string;
  description: string;
} | null {
  if (detail.submission.workflowStatus === 'received') {
    return {
      action: 'begin_triage',
      expectedStatus: 'received',
      label: 'Begin triage',
      description: 'Move this report into protected triage without making a report decision.',
    };
  }
  if (detail.submission.workflowStatus === 'triage') {
    return {
      action: 'begin_review',
      expectedStatus: 'triage',
      label: 'Begin review',
      description:
        'Move this triaged report into protected review so typed decisions become reachable.',
    };
  }
  return null;
}

export function ReportReviewEntryControls({ submissionId }: { submissionId: string | null }) {
  const [detailState, setDetailState] = useState<DetailState>(
    submissionId ? { status: 'loading' } : { status: 'missing_id' },
  );
  const [mutationState, setMutationState] = useState<MutationState>({ status: 'idle' });

  const loadDetail = useCallback(async () => {
    if (!submissionId) {
      setDetailState({ status: 'missing_id' });
      return;
    }
    setDetailState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/reports/${encodeURIComponent(submissionId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 403) {
        setDetailState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setDetailState({ status: 'not_found' });
        return;
      }
      if (response.status === 503) {
        setDetailState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setDetailState({ status: 'error' });
        return;
      }
      const result = reportSubmissionReviewDetailResponseSchema.safeParse(await response.json());
      setDetailState(
        result.success ? { status: 'ready', detail: result.data } : { status: 'error' },
      );
    } catch {
      setDetailState({ status: 'error' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const submitTransition = useCallback(
    async (retryRequest?: ReviewEntryRequest) => {
      if (!submissionId || detailState.status !== 'ready') return;
      const transition = nextAction(detailState.detail);
      if (!transition) return;

      const request =
        retryRequest ??
        reviewEntryRequestSchema.parse({
          schemaVersion: 'submission-review-entry-v1',
          requestId: globalThis.crypto.randomUUID(),
          submissionType: detailState.detail.submission.submissionType,
          action: transition.action,
          expectedStatus: transition.expectedStatus,
          expectedUpdatedAt: detailState.detail.submission.updatedAt,
        });
      setMutationState({ status: 'submitting', request });

      try {
        const response = await fetch(
          `/admin/api/review-entry/${encodeURIComponent(submissionId)}`,
          {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
          },
        );
        if (response.status === 403) {
          setMutationState({
            status: 'failed',
            request,
            message: 'Your verified administration identity cannot perform review entry.',
          });
          return;
        }
        if (response.status === 409) {
          setMutationState({
            status: 'failed',
            request,
            message:
              'The Submission changed before this transition was applied. Reload the current state.',
          });
          return;
        }
        if (!response.ok) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The protected transition could not complete safely.',
          });
          return;
        }
        const result = reviewEntryReceiptSchema.safeParse(await response.json());
        if (!result.success) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The transition response could not be verified.',
          });
          return;
        }
        setMutationState({ status: 'committed', receipt: result.data });
        await loadDetail();
      } catch {
        setMutationState({
          status: 'failed',
          request,
          message: 'The protected transition request could not be completed.',
        });
      }
    },
    [detailState, loadDetail, submissionId],
  );

  if (detailState.status === 'loading') {
    return (
      <StatusPanel
        title="Loading review-entry controls"
        description="The current private workflow state is being verified before any mutation control is shown."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (detailState.status === 'missing_id' || detailState.status === 'not_found') {
    return (
      <StatusPanel
        title="Report Submission unavailable"
        description="Open a valid payment or problem report from the protected queue."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }
  if (detailState.status === 'denied') {
    return (
      <StatusPanel
        title="Review-entry access denied"
        description="Your verified administration identity cannot read this protected Submission."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (detailState.status === 'unavailable' || detailState.status === 'error') {
    return (
      <StatusPanel
        title="Review-entry controls unavailable"
        description="The current workflow state could not be verified, so no mutation control is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadDetail()}>
            Reload current state
          </Button>
        }
      />
    );
  }

  const transition = nextAction(detailState.detail);
  return (
    <section
      className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-800">
            P5-06B protected review entry
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            Current state: {detailState.detail.submission.workflowStatus.replaceAll('_', ' ')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            These controls only move the private Submission into the normal review workflow. They do
            not accept Evidence, decide the report, change canonical data, export, or publish.
          </p>
        </div>
        <span className="rounded-pill border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-800">
          {detailState.detail.submission.publicId}
        </span>
      </div>

      {mutationState.status === 'committed' ? (
        <div className="mt-4 flex items-start gap-3 rounded-control border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            Transition {mutationState.receipt.state}: {mutationState.receipt.fromStatus} →{' '}
            {mutationState.receipt.toStatus}.
          </p>
        </div>
      ) : null}

      {mutationState.status === 'failed' ? (
        <div className="mt-4 rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="m-0">{mutationState.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void submitTransition(mutationState.request)}
            >
              Retry same request
            </Button>
            <Button variant="ghost" onClick={() => void loadDetail()}>
              Reload current state
            </Button>
          </div>
        </div>
      ) : null}

      {transition ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-control border border-brand-200 bg-white p-4">
          <div>
            <p className="m-0 text-sm font-semibold text-ink">{transition.label}</p>
            <p className="mt-1 text-sm text-muted">{transition.description}</p>
          </div>
          <Button
            loading={mutationState.status === 'submitting'}
            disabled={mutationState.status === 'submitting'}
            onClick={() => void submitTransition()}
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            {transition.label}
          </Button>
        </div>
      ) : (
        <p className="mt-5 rounded-control border border-border bg-white p-4 text-sm text-muted">
          No P5-06B review-entry transition is available from the current state.
        </p>
      )}
    </section>
  );
}
