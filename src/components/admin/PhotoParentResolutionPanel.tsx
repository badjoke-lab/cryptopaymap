import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Image,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  photoParentResolutionPreviewResponseSchema,
  type PhotoParentResolutionPreviewResponse,
} from '../../admin/submissions/photo-parent-resolution-preview';
import {
  photoParentResolutionReceiptSchema,
  photoParentResolutionRequestSchema,
  type PhotoParentResolutionReceipt,
  type PhotoParentResolutionRequest,
} from '../../admin/submissions/photo-parent-resolution';
import { Button } from '../ui/Button';

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; preview: PhotoParentResolutionPreviewResponse }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

type MutationState =
  | { status: 'idle' }
  | { status: 'submitting'; request: PhotoParentResolutionRequest }
  | { status: 'failed'; request: PhotoParentResolutionRequest; message: string }
  | { status: 'committed'; receipt: PhotoParentResolutionReceipt };

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

function outcomeLabel(value: 'approved' | 'partially_approved' | 'not_approved' | null): string {
  return value === null ? 'Not available' : value.replaceAll('_', ' ');
}

function readinessDescription(preview: PhotoParentResolutionPreviewResponse): string {
  if (preview.readiness === 'pending') {
    return preview.pendingCount === 1
      ? '1 child Media decision remains pending. The parent cannot be resolved yet.'
      : `${preview.pendingCount} child Media decisions remain pending. The parent cannot be resolved yet.`;
  }
  if (preview.readiness === 'not_in_review') {
    return `The parent is currently ${preview.workflowStatus.replaceAll('_', ' ')}. It must be in review before aggregate resolution.`;
  }
  if (preview.readiness === 'resolved') {
    return `The parent is already resolved as ${outcomeLabel(preview.currentResolution)}.`;
  }
  if (preview.readiness === 'blocked') {
    return 'The retained handoff or a child Media decision is inconsistent. No mutation request is exposed.';
  }
  return `All child Media decisions are complete. The derived parent outcome is ${outcomeLabel(preview.derivedResolution)}.`;
}

export function PhotoParentResolutionPanel({ submissionId }: { submissionId: string | null }) {
  const [previewState, setPreviewState] = useState<PreviewState>(
    submissionId ? { status: 'loading' } : { status: 'missing_id' },
  );
  const [mutationState, setMutationState] = useState<MutationState>({ status: 'idle' });
  const [publicMessage, setPublicMessage] = useState('');
  const [internalNote, setInternalNote] = useState('');

  const loadPreview = useCallback(async () => {
    if (!submissionId) {
      setPreviewState({ status: 'missing_id' });
      return;
    }
    setPreviewState({ status: 'loading' });
    try {
      const response = await fetch(
        `/admin/api/photo-submissions/${encodeURIComponent(submissionId)}/parent-resolution`,
        {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        },
      );
      if (response.status === 403) {
        setPreviewState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setPreviewState({ status: 'not_found' });
        return;
      }
      if (response.status === 503) {
        setPreviewState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setPreviewState({ status: 'error' });
        return;
      }
      const result = photoParentResolutionPreviewResponseSchema.safeParse(await response.json());
      setPreviewState(
        result.success ? { status: 'ready', preview: result.data } : { status: 'error' },
      );
    } catch {
      setPreviewState({ status: 'error' });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const submitResolution = useCallback(
    async (retryRequest?: PhotoParentResolutionRequest) => {
      if (!submissionId || previewState.status !== 'ready') return;
      const snapshot = previewState.preview.expectedRequest;
      if (snapshot === null) return;
      const request =
        retryRequest ??
        photoParentResolutionRequestSchema.parse({
          schemaVersion: 'photo-parent-resolution-v1',
          requestId: globalThis.crypto.randomUUID(),
          ...snapshot,
          publicMessage,
          internalNote: internalNote.trim() === '' ? null : internalNote,
        });
      setMutationState({ status: 'submitting', request });

      try {
        const response = await fetch(
          `/admin/api/photo-submissions/${encodeURIComponent(submissionId)}/parent-resolution`,
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
            message: 'Your verified administration identity cannot resolve this Photos parent.',
          });
          return;
        }
        if (response.status === 409) {
          setMutationState({
            status: 'failed',
            request,
            message:
              'The parent, handoff, or a child Media decision changed before commit. Reload the exact preview.',
          });
          return;
        }
        if (response.status === 422) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The child Media set is no longer eligible for aggregate resolution.',
          });
          return;
        }
        if (!response.ok) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The protected Photos parent-resolution operation could not complete safely.',
          });
          return;
        }
        const result = photoParentResolutionReceiptSchema.safeParse(await response.json());
        if (!result.success) {
          setMutationState({
            status: 'failed',
            request,
            message: 'The Photos parent-resolution response could not be verified.',
          });
          return;
        }
        setMutationState({ status: 'committed', receipt: result.data });
        await loadPreview();
      } catch {
        setMutationState({
          status: 'failed',
          request,
          message: 'The protected Photos parent-resolution request could not be completed.',
        });
      }
    },
    [internalNote, loadPreview, previewState, publicMessage, submissionId],
  );

  if (previewState.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Photos parent outcome preview"
        description="The exact private handoff and every child Media decision are being revalidated."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (previewState.status === 'missing_id' || previewState.status === 'not_found') {
    return (
      <StatusPanel
        title="Photos parent outcome unavailable"
        description="Open a valid Photos Submission from the protected review queue."
        icon={<AlertTriangle className="size-5" />}
      />
    );
  }
  if (previewState.status === 'denied') {
    return (
      <StatusPanel
        title="Photos parent-resolution access denied"
        description="Your verified administration identity cannot read or apply the aggregate outcome."
        icon={<ShieldAlert className="size-5" />}
      />
    );
  }
  if (previewState.status === 'unavailable' || previewState.status === 'error') {
    return (
      <StatusPanel
        title="Photos parent outcome preview unavailable"
        description="The exact child decision set could not be verified, so no resolution control is displayed."
        icon={<AlertTriangle className="size-5" />}
        action={
          <Button variant="secondary" onClick={() => void loadPreview()}>
            Reload exact preview
          </Button>
        }
      />
    );
  }

  const preview = previewState.preview;
  const isSubmitting = mutationState.status === 'submitting';
  return (
    <section
      className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-800">
            P5-06E exact aggregate outcome
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
            {preview.approvedCount} approved · {preview.rejectedCount} rejected ·{' '}
            {preview.pendingCount} pending
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {readinessDescription(preview)} The result is derived from the complete P5-05E handoff;
            it cannot be selected manually.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void loadPreview()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Reload exact preview
        </Button>
      </div>

      {mutationState.status === 'committed' ? (
        <div className="mt-4 flex items-start gap-3 rounded-control border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            Parent resolution {mutationState.receipt.state}: {mutationState.receipt.resolution}.{' '}
            {mutationState.receipt.approvedCount} approved and {mutationState.receipt.rejectedCount}{' '}
            rejected.
          </p>
        </div>
      ) : null}

      {mutationState.status === 'failed' ? (
        <div className="mt-4 rounded-control border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="m-0">{mutationState.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => void submitResolution(mutationState.request)}
            >
              Retry same request
            </Button>
            <Button variant="ghost" onClick={() => void loadPreview()}>
              Reload exact preview
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {preview.media.map((item) => (
          <article
            key={item.mediaAssetId}
            className="rounded-control border border-brand-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex size-10 items-center justify-center rounded-control bg-canvas text-brand-700"
                aria-hidden="true"
              >
                {item.publicDecision === 'pending' ? (
                  <CircleDashed className="size-5" />
                ) : (
                  <Image className="size-5" />
                )}
              </span>
              <div>
                <h3 className="m-0 break-all text-sm font-semibold text-ink">
                  {item.mediaReference}
                </h3>
                <p className="mt-1 text-xs text-muted">
                  {item.publicDecision} · updated {new Date(item.mediaUpdatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {preview.readiness === 'ready' ? (
        <form
          className="mt-5 grid gap-4 rounded-control border border-brand-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!publicMessage.trim()) return;
            void submitResolution();
          }}
        >
          <div>
            <p className="m-0 text-sm font-semibold text-ink">
              Resolve as {outcomeLabel(preview.derivedResolution)}
            </p>
            <p className="mt-1 text-sm text-muted">
              The exact child snapshot above will be submitted. Any intervening change causes a
              conflict rather than a stale commit.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Public status message
            <textarea
              className="min-h-24 rounded-control border border-border bg-surface px-3 py-2 font-normal"
              maxLength={1_000}
              required
              value={publicMessage}
              onChange={(event) => setPublicMessage(event.currentTarget.value)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            Private reviewer note (optional)
            <textarea
              className="min-h-20 rounded-control border border-border bg-surface px-3 py-2 font-normal"
              maxLength={2_000}
              value={internalNote}
              onChange={(event) => setInternalNote(event.currentTarget.value)}
            />
          </label>
          <div>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || !publicMessage.trim()}
            >
              Resolve Photos parent
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-5 rounded-control border border-border bg-white p-4 text-sm text-muted">
          No P5-06E parent-resolution request is available from this exact preview.
        </p>
      )}
    </section>
  );
}
