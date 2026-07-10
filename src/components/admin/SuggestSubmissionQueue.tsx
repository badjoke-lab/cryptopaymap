import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  suggestSubmissionQueueResponseSchema,
  type SuggestSubmissionQueueItem,
} from '../../admin/submissions/queue';
import { Button } from '../ui/Button';

type QueueState =
  | { status: 'loading' }
  | { status: 'ready'; items: SuggestSubmissionQueueItem[]; nextCursor: string | null }
  | { status: 'loading_more'; items: SuggestSubmissionQueueItem[]; nextCursor: string | null }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error' };

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
      className="rounded-card border border-border bg-surface p-6 shadow-sm"
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
          <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

function QueueCard({ item }: { item: SuggestSubmissionQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
            {item.publicId}
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink">{item.name}</h3>
          <p className="mt-2 text-sm text-muted">
            {item.suggestionKind === 'physical_place' ? 'Physical Place' : 'Online Service'} ·{' '}
            {item.relationship.replaceAll('_', ' ')}
          </p>
        </div>
        <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
          {item.workflowStatus.replaceAll('_', ' ')}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium text-muted">Priority</dt>
          <dd className="mt-1 text-ink">{item.priority}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Evidence links</dt>
          <dd className="mt-1 text-ink">{item.evidenceCount}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Submitted</dt>
          <dd className="mt-1 text-ink">{new Date(item.submittedAt).toLocaleString()}</dd>
        </div>
      </dl>
      <div className="mt-5">
        <a
          className="motion-feedback inline-flex min-h-11 items-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-brand-700"
          href={`/admin/submissions/detail?id=${encodeURIComponent(item.id)}`}
        >
          Review submission
        </a>
      </div>
    </article>
  );
}

export function SuggestSubmissionQueue() {
  const [state, setState] = useState<QueueState>({ status: 'loading' });

  const loadQueue = useCallback(async (cursor?: string, append = false) => {
    setState((current) =>
      append && (current.status === 'ready' || current.status === 'loading_more')
        ? { ...current, status: 'loading_more' }
        : { status: 'loading' },
    );
    const url = new URL('/admin/api/submissions', window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);

    try {
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (response.status === 403) {
        setState({ status: 'denied' });
        return;
      }
      if (response.status === 503) {
        setState({ status: 'unavailable' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }

      const result = suggestSubmissionQueueResponseSchema.safeParse(await response.json());
      if (!result.success) {
        setState({ status: 'error' });
        return;
      }
      setState((current) => ({
        status: 'ready',
        items:
          append && (current.status === 'ready' || current.status === 'loading_more')
            ? [...current.items, ...result.data.items]
            : result.data.items,
        nextCursor: result.data.nextCursor,
      }));
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const pageState = state.status === 'ready' || state.status === 'loading_more' ? state : null;
  const items = pageState?.items ?? [];

  return (
    <div aria-live="polite">
      {state.status === 'loading' ? (
        <StatusPanel
          title="Loading Suggest submissions"
          description="The protected queue is loading bounded review summaries only. Original payloads and contact data are not requested."
          icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
        />
      ) : null}
      {state.status === 'denied' ? (
        <StatusPanel
          title="Submission review access denied"
          description="Your verified administration identity does not have the Submission read capability."
          icon={<ShieldAlert className="size-5" />}
        />
      ) : null}
      {state.status === 'unavailable' ? (
        <StatusPanel
          title="Submission queue unavailable"
          description="The protected queue is not configured or could not complete safely. No partial result is displayed."
          icon={<AlertTriangle className="size-5" />}
          action={
            <Button variant="secondary" onClick={() => void loadQueue()}>
              Retry queue
            </Button>
          }
        />
      ) : null}
      {state.status === 'error' ? (
        <StatusPanel
          title="Submission queue response could not be verified"
          description="The queue response was incomplete or invalid. No unverified Submission values are displayed."
          icon={<AlertTriangle className="size-5" />}
          action={
            <Button variant="secondary" onClick={() => void loadQueue()}>
              Retry queue
            </Button>
          }
        />
      ) : null}
      {pageState && items.length === 0 ? (
        <StatusPanel
          title="No actionable Suggest submissions"
          description="The bounded queue returned a valid empty page."
          icon={<CheckCircle2 className="size-5" />}
        />
      ) : null}
      {items.length > 0 ? (
        <section aria-labelledby="suggest-submission-results-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 text-sm font-semibold text-brand-700">Protected queue</p>
              <h2
                id="suggest-submission-results-title"
                className="mt-1 text-2xl font-semibold tracking-tight text-ink"
              >
                Suggest submissions
              </h2>
            </div>
            <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              {items.length} loaded
            </span>
          </div>
          <div className="mt-5 grid gap-4">
            {items.map((item) => (
              <QueueCard key={item.id} item={item} />
            ))}
          </div>
          {pageState?.nextCursor ? (
            <div className="mt-5 flex justify-center">
              <Button
                variant="secondary"
                disabled={state.status === 'loading_more'}
                onClick={() => void loadQueue(pageState.nextCursor ?? undefined, true)}
              >
                {state.status === 'loading_more' ? 'Loading more…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
