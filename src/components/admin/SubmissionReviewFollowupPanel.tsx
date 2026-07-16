import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MessageSquareMore,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { suggestSubmissionReviewDetailResponseSchema } from '../../admin/submissions/detail';
import { photoSubmissionDetailResponseSchema } from '../../admin/submissions/photo-parent';
import { reportSubmissionReviewDetailResponseSchema } from '../../admin/submissions/report-detail';
import {
  reviewFollowupReceiptSchema,
  reviewFollowupRequestSchema,
  type ReviewFollowupRequest,
} from '../../admin/submissions/review-followup';
import { Button } from '../ui/Button';

type SourceKind = 'suggest' | 'report' | 'photos';
type FollowupSubmissionType = 'suggest' | 'payment_report' | 'problem_report' | 'photos';
type FollowupStatus =
  | 'received'
  | 'triage'
  | 'in_review'
  | 'needs_information'
  | 'on_hold'
  | 'resolved'
  | 'duplicate'
  | 'rejected_spam'
  | 'withdrawn';
type HoldDays = 30 | 60 | 90;

interface Snapshot {
  submissionId: string;
  publicId: string;
  submissionType: FollowupSubmissionType;
  workflowStatus: FollowupStatus;
  updatedAt: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: Snapshot }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

type MutationState =
  | { status: 'idle' }
  | { status: 'submitting'; request: ReviewFollowupRequest }
  | { status: 'failed'; request: ReviewFollowupRequest; message: string }
  | {
      status: 'committed';
      action: ReviewFollowupRequest['action'];
      replayed: boolean;
      nextReviewAt: string | null;
    };

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

async function loadSnapshot(sourceKind: SourceKind, submissionId: string): Promise<Response> {
  const path =
    sourceKind === 'suggest'
      ? `/admin/api/submissions/${encodeURIComponent(submissionId)}`
      : sourceKind === 'report'
        ? `/admin/api/reports/${encodeURIComponent(submissionId)}`
        : `/admin/api/photo-submissions/${encodeURIComponent(submissionId)}`;
  return fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
}

function parseSnapshot(sourceKind: SourceKind, value: unknown): Snapshot | null {
  if (sourceKind === 'suggest') {
    const result = suggestSubmissionReviewDetailResponseSchema.safeParse(value);
    if (!result.success) return null;
    return {
      submissionId: result.data.submission.id,
      publicId: result.data.submission.publicId,
      submissionType: 'suggest',
      workflowStatus: result.data.submission.workflowStatus,
      updatedAt: result.data.submission.updatedAt,
    };
  }
  if (sourceKind === 'report') {
    const result = reportSubmissionReviewDetailResponseSchema.safeParse(value);
    if (!result.success) return null;
    return {
      submissionId: result.data.submission.id,
      publicId: result.data.submission.publicId,
      submissionType: result.data.submission.submissionType,
      workflowStatus: result.data.submission.workflowStatus,
      updatedAt: result.data.submission.updatedAt,
    };
  }
  const result = photoSubmissionDetailResponseSchema.safeParse(value);
  if (!result.success) return null;
  return {
    submissionId: result.data.submission.id,
    publicId: result.data.submission.publicId,
    submissionType: 'photos',
    workflowStatus: result.data.submission.workflowStatus,
    updatedAt: result.data.submission.updatedAt,
  };
}

function actionLabel(action: ReviewFollowupRequest['action']): string {
  if (action === 'request_information') return 'Information request';
  if (action === 'place_on_hold') return 'Hold';
  if (action === 'resume_after_information') return 'Information review resumed';
  return 'Held review resumed';
}

export function SubmissionReviewFollowupPanel({
  sourceKind,
  submissionId,
}: {
  sourceKind: SourceKind;
  submissionId: string | null;
}) {
  const [loadState, setLoadState] = useState<LoadState>(
    submissionId ? { status: 'loading' } : { status: 'missing_id' },
  );
  const [mutationState, setMutationState] = useState<MutationState>({ status: 'idle' });
  const [requestedAction, setRequestedAction] = useState('');
  const [informationPublicMessage, setInformationPublicMessage] = useState('');
  const [holdDays, setHoldDays] = useState<HoldDays>(30);
  const [holdReason, setHoldReason] = useState('');
  const [holdRequiredAction, setHoldRequiredAction] = useState('');
  const [holdPublicMessage, setHoldPublicMessage] = useState('');

  const loadCurrent = useCallback(async () => {
    if (!submissionId) {
      setLoadState({ status: 'missing_id' });
      return;
    }
    setLoadState({ status: 'loading' });
    try {
      const response = await loadSnapshot(sourceKind, submissionId);
      if (response.status === 403) {
        setLoadState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setLoadState({ status: 'not_found' });
        return;
      }
      if (response.status === 503) {
        setLoadState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setLoadState({ status: 'error' });
        return;
      }
      const snapshot = parseSnapshot(sourceKind, await response.json());
      setLoadState(snapshot ? { status: 'ready', snapshot } : { status: 'error' });
    } catch {
      setLoadState({ status: 'error' });
    }
  }, [sourceKind, submissionId]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const submitRequest = useCallback(
    async (request: ReviewFollowupRequest) => {
      if (!submissionId) return;
      setMutationState({ status: 'submitting', request });
      try {
        const response = await fetch(
          `/admin/api/review-followup/${encodeURIComponent(submissionId)}`,
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
            message: 'Your verified administration identity cannot perform review follow-up.',
          });
          return;
        }
        if (response.status === 409) {
          setMutationState({
            status: 'failed',
            request,
            message:
              'The Submission changed before this operation committed. Reload the current state.',
          });
          return;
        }
        if (!response.ok) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The protected review follow-up operation could not complete safely.',
          });
          return;
        }
        const result = reviewFollowupReceiptSchema.safeParse(await response.json());
        if (!result.success) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The review follow-up response could not be verified.',
          });
          return;
        }
        setMutationState({
          status: 'committed',
          action: result.data.action,
          replayed: result.data.state === 'replayed',
          nextReviewAt: result.data.nextReviewAt,
        });
        setLoadState((current) =>
          current.status === 'ready'
            ? {
                status: 'ready',
                snapshot: {
                  ...current.snapshot,
                  workflowStatus: result.data.toStatus,
                  updatedAt: result.data.changedAt,
                },
              }
            : current,
        );
      } catch {
        setMutationState({
          status: 'failed',
          request,
          message: 'The protected review follow-up request could not be completed.',
        });
      }
    },
    [submissionId],
  );

  if (loadState.status === 'loading') {
    return (
      <StatusPanel
        title="Loading review follow-up controls"
        description="The current private workflow state is being verified before any mutation control is shown."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (loadState.status === 'missing_id' || loadState.status === 'not_found') {
    return (
      <StatusPanel
        title="Submission unavailable"
        description="Open a valid Submission from the protected review queue."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }
  if (loadState.status === 'denied') {
    return (
      <StatusPanel
        title="Review follow-up access denied"
        description="Your verified administration identity cannot read this protected Submission."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (loadState.status === 'unavailable' || loadState.status === 'error') {
    return (
      <StatusPanel
        title="Review follow-up controls unavailable"
        description="The current workflow state could not be verified, so no mutation control is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadCurrent()}>
            Reload current state
          </Button>
        }
      />
    );
  }

  const snapshot = loadState.snapshot;
  const isSubmitting = mutationState.status === 'submitting';
  const informationRequest = () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: globalThis.crypto.randomUUID(),
      submissionType: snapshot.submissionType,
      action: 'request_information',
      expectedStatus: 'in_review',
      expectedUpdatedAt: snapshot.updatedAt,
      requestedAction,
      publicMessage: informationPublicMessage,
    });
  const holdRequest = () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: globalThis.crypto.randomUUID(),
      submissionType: snapshot.submissionType,
      action: 'place_on_hold',
      expectedStatus: 'in_review',
      expectedUpdatedAt: snapshot.updatedAt,
      holdDays,
      holdReason,
      requiredAction: holdRequiredAction,
      publicMessage: holdPublicMessage,
    });
  const resumeRequest = (action: 'resume_after_information' | 'resume_from_hold') =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: globalThis.crypto.randomUUID(),
      submissionType: snapshot.submissionType,
      action,
      expectedStatus: action === 'resume_after_information' ? 'needs_information' : 'on_hold',
      expectedUpdatedAt: snapshot.updatedAt,
    });

  return (
    <section
      className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-800">
            P5-06C protected review follow-up
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            Current state: {snapshot.workflowStatus.replaceAll('_', ' ')}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Information requests and Holds project only bounded public-safe status content. Resume
            operations copy no prior request text, Hold reason, reviewer identity, or private note.
          </p>
        </div>
        <span className="rounded-pill border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-800">
          {snapshot.publicId}
        </span>
      </div>

      {mutationState.status === 'committed' ? (
        <div className="mt-4 flex items-start gap-3 rounded-control border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            {actionLabel(mutationState.action)} {mutationState.replayed ? 'replayed safely' : 'committed'}.
            {mutationState.nextReviewAt
              ? ` Next review: ${new Date(mutationState.nextReviewAt).toLocaleString()}.`
              : ''}
          </p>
        </div>
      ) : null}

      {mutationState.status === 'failed' ? (
        <div className="mt-4 rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="m-0">{mutationState.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void submitRequest(mutationState.request)}
            >
              Retry same request
            </Button>
            <Button variant="ghost" onClick={() => void loadCurrent()}>
              Reload current state
            </Button>
          </div>
        </div>
      ) : null}

      {snapshot.workflowStatus === 'in_review' ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <form
            className="grid gap-4 rounded-control border border-brand-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!requestedAction.trim() || !informationPublicMessage.trim()) return;
              void submitRequest(informationRequest());
            }}
          >
            <div className="flex items-center gap-2">
              <MessageSquareMore className="size-5 text-brand-700" aria-hidden="true" />
              <h3 className="m-0 text-lg font-semibold text-ink">Request information</h3>
            </div>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Requested action
              <textarea
                className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                maxLength={500}
                required
                value={requestedAction}
                onChange={(event) => setRequestedAction(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Public status message
              <textarea
                className="min-h-28 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                maxLength={1_000}
                required
                value={informationPublicMessage}
                onChange={(event) => setInformationPublicMessage(event.currentTarget.value)}
              />
            </label>
            <div>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={
                  isSubmitting ||
                  !requestedAction.trim() ||
                  !informationPublicMessage.trim()
                }
              >
                Request information
              </Button>
            </div>
          </form>

          <form
            className="grid gap-4 rounded-control border border-brand-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!holdReason.trim() || !holdRequiredAction.trim() || !holdPublicMessage.trim()) {
                return;
              }
              void submitRequest(holdRequest());
            }}
          >
            <div className="flex items-center gap-2">
              <Clock3 className="size-5 text-brand-700" aria-hidden="true" />
              <h3 className="m-0 text-lg font-semibold text-ink">Place on Hold</h3>
            </div>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Hold period
              <select
                className="min-h-11 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                value={holdDays}
                onChange={(event) => setHoldDays(Number(event.currentTarget.value) as HoldDays)}
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Internal Hold reason
              <textarea
                className="min-h-20 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                maxLength={500}
                required
                value={holdReason}
                onChange={(event) => setHoldReason(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Required action
              <textarea
                className="min-h-20 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                maxLength={500}
                required
                value={holdRequiredAction}
                onChange={(event) => setHoldRequiredAction(event.currentTarget.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              Public status message
              <textarea
                className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
                maxLength={1_000}
                required
                value={holdPublicMessage}
                onChange={(event) => setHoldPublicMessage(event.currentTarget.value)}
              />
            </label>
            <div>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={
                  isSubmitting ||
                  !holdReason.trim() ||
                  !holdRequiredAction.trim() ||
                  !holdPublicMessage.trim()
                }
              >
                Place on Hold
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {snapshot.workflowStatus === 'needs_information' ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-control border border-brand-200 bg-white p-4">
          <div>
            <p className="m-0 text-sm font-semibold text-ink">Resume after information</p>
            <p className="mt-1 text-sm text-muted">
              Return the Submission to in review after the follow-up material has been examined.
            </p>
          </div>
          <Button
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => void submitRequest(resumeRequest('resume_after_information'))}
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            Resume review
          </Button>
        </div>
      ) : null}

      {snapshot.workflowStatus === 'on_hold' ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-control border border-brand-200 bg-white p-4">
          <div>
            <p className="m-0 text-sm font-semibold text-ink">Resume held review</p>
            <p className="mt-1 text-sm text-muted">
              Resume explicitly. Reaching the next-review date never changes state automatically.
            </p>
          </div>
          <Button
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => void submitRequest(resumeRequest('resume_from_hold'))}
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            Resume review
          </Button>
        </div>
      ) : null}

      {!['in_review', 'needs_information', 'on_hold'].includes(snapshot.workflowStatus) ? (
        <p className="mt-5 rounded-control border border-border bg-white p-4 text-sm text-muted">
          No P5-06C review follow-up operation is available from the current state.
        </p>
      ) : null}
    </section>
  );
}
