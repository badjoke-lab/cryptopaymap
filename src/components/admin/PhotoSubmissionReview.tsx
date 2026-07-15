import {
  AlertTriangle,
  CheckCircle2,
  Image,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  type PhotoSubmissionDetailResponse,
  photoSubmissionDetailResponseSchema,
} from '../../admin/submissions/photo-parent';
import {
  type ReviewEntryReceipt,
  type ReviewEntryRequest,
  reviewEntryReceiptSchema,
  reviewEntryRequestSchema,
} from '../../admin/submissions/review-entry';
import { Button } from '../ui/Button';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: PhotoSubmissionDetailResponse }
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

function nextAction(detail: PhotoSubmissionDetailResponse): {
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
      description: 'Move this parent Photos Submission into protected triage.',
    };
  }
  if (detail.submission.workflowStatus === 'triage') {
    return {
      action: 'begin_review',
      expectedStatus: 'triage',
      label: 'Begin review',
      description: 'Move this triaged parent Submission into protected review.',
    };
  }
  return null;
}

function formatBytes(value: number): string {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export function PhotoSubmissionReview({ submissionId }: { submissionId: string | null }) {
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
      const response = await fetch(
        `/admin/api/photo-submissions/${encodeURIComponent(submissionId)}`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
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
      const result = photoSubmissionDetailResponseSchema.safeParse(await response.json());
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
          submissionType: 'photos',
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
              'The parent Submission changed before this transition was applied. Reload the current state.',
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
        title="Loading Photos parent Submission"
        description="The private parent workflow and normalized media summaries are being verified."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (detailState.status === 'missing_id' || detailState.status === 'not_found') {
    return (
      <StatusPanel
        title="Photos parent Submission unavailable"
        description="Open a valid Photos Submission from the protected queue."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }
  if (detailState.status === 'denied') {
    return (
      <StatusPanel
        title="Photos review access denied"
        description="Your verified administration identity cannot read this parent Submission."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (detailState.status === 'unavailable' || detailState.status === 'error') {
    return (
      <StatusPanel
        title="Photos parent review unavailable"
        description="The current parent workflow could not be verified, so no mutation control is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadDetail()}>
            Reload current state
          </Button>
        }
      />
    );
  }

  const detail = detailState.detail;
  const transition = nextAction(detail);
  return (
    <div className="grid gap-6" aria-live="polite">
      <section className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-800">
              P5-06B protected review entry
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
              Current state: {detail.submission.workflowStatus.replaceAll('_', ' ')}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Review entry changes only the private parent Submission state. It does not approve
              Media, copy public objects, resolve the parent Submission, mutate canonical data,
              export, or publish.
            </p>
          </div>
          <span className="rounded-pill border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-800">
            {detail.submission.publicId}
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

      <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Parent Submission</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-muted">Target</dt>
            <dd className="mt-1 break-all text-ink">
              {detail.submission.targetType} · {detail.submission.targetId}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Relationship</dt>
            <dd className="mt-1 text-ink">{detail.projection.relationship.replaceAll('_', ' ')}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Priority</dt>
            <dd className="mt-1 text-ink">{detail.submission.priority}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Updated</dt>
            <dd className="mt-1 text-ink">
              {new Date(detail.submission.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
        {detail.projection.submitterNote ? (
          <div className="mt-5 rounded-control border border-border bg-canvas p-4">
            <h3 className="m-0 text-sm font-semibold text-ink">Submitter note</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
              {detail.projection.submitterNote}
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold text-brand-700">Normalized review projection</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
              Public-gallery candidates
            </h2>
          </div>
          <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-medium text-muted">
            {detail.projection.media.length} candidate
            {detail.projection.media.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {detail.projection.media.map((item) => (
            <article
              key={item.quarantineUploadId}
              className="rounded-control border border-border bg-canvas p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 items-center justify-center rounded-control bg-surface text-brand-700"
                  aria-hidden="true"
                >
                  <Image className="size-5" />
                </span>
                <div>
                  <h3 className="m-0 text-base font-semibold text-ink">
                    {item.role.replaceAll('_', ' ')}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {item.declaredMimeType} · {formatBytes(item.declaredByteSize)}
                  </p>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-muted">Rights basis</dt>
                  <dd className="mt-1 text-ink">{item.rightsStatus.replaceAll('_', ' ')}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted">Captured</dt>
                  <dd className="mt-1 text-ink">{item.capturedAt ?? 'Not supplied'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted">Photographer present</dt>
                  <dd className="mt-1 text-ink">{item.photographerPresent ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted">Public display permission</dt>
                  <dd className="mt-1 text-ink">Yes</dd>
                </div>
              </dl>
              {item.description ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
                  {item.description}
                </p>
              ) : null}
              {item.suggestedAltText ? (
                <p className="mt-3 text-sm text-muted">
                  <span className="font-medium text-ink">Suggested alt:</span>{' '}
                  {item.suggestedAltText}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">
          Parent workflow history
        </h2>
        {detail.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No bounded workflow event is available.</p>
        ) : (
          <ol className="mt-4 grid gap-3">
            {detail.events.map((event) => (
              <li
                key={`${event.createdAt}-${event.action}-${event.toStatus}`}
                className="rounded-control border border-border bg-canvas p-4 text-sm"
              >
                <p className="m-0 font-semibold text-ink">
                  {event.fromStatus ?? 'created'} → {event.toStatus}
                </p>
                <p className="mt-1 text-muted">
                  {event.action.replaceAll('_', ' ')} · {new Date(event.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
        {detail.eventsTruncated ? (
          <p className="mt-4 text-sm text-amber-800">Older events are not included in this view.</p>
        ) : null}
      </section>
    </div>
  );
}
