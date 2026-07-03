import { AlertTriangle, CheckCircle2, Image, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  mediaReviewQueueResponseSchema,
  type MediaReviewQueueItem,
} from '../../admin/media-review/workspace';
import { Button } from '../ui/Button';

type QueueState =
  | { status: 'loading' }
  | { status: 'ready'; items: MediaReviewQueueItem[]; hasMore: boolean }
  | { status: 'denied' | 'invalid_query' | 'unavailable' | 'error' };

interface Filters {
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'superseded';
  purpose:
    | ''
    | 'evidence'
    | 'owner_verification'
    | 'public_gallery_candidate'
    | 'public_gallery'
    | 'canonical_logo';
  visibility: '' | 'private' | 'public' | 'restricted';
}

const defaults: Filters = {
  reviewStatus: 'pending',
  purpose: '',
  visibility: '',
};

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

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

function QueueCard({ item }: { item: MediaReviewQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            <span>{label(item.purpose)}</span>
            <span>·</span>
            <span>{label(item.role)}</span>
            <span>·</span>
            <span>{label(item.subject.type)}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-ink">
            {label(item.reviewStatus)} Media
          </h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold text-ink">Rights</dt>
              <dd className="mt-1 text-muted">{label(item.rightsStatus)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Visibility</dt>
              <dd className="mt-1 text-muted">{label(item.visibility)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Files</dt>
              <dd className="mt-1 text-muted">{item.fileCount}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Updated</dt>
              <dd className="mt-1 break-words text-muted">{item.updatedAt}</dd>
            </div>
          </dl>
          <p className="mt-4 break-all text-xs text-muted">
            Subject: {item.subject.id}
          </p>
        </div>
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-brand-700"
          href={`/admin/media/detail/?id=${encodeURIComponent(item.id)}`}
        >
          Review Media
        </a>
      </div>
    </article>
  );
}

export function MediaReviewQueue() {
  const [draft, setDraft] = useState<Filters>(defaults);
  const [filters, setFilters] = useState<Filters>(defaults);
  const [state, setState] = useState<QueueState>({ status: 'loading' });

  const load = useCallback(async (active: Filters, signal?: AbortSignal) => {
    setState({ status: 'loading' });
    const params = new URLSearchParams({ reviewStatus: active.reviewStatus, limit: '50' });
    if (active.purpose) params.set('purpose', active.purpose);
    if (active.visibility) params.set('visibility', active.visibility);
    try {
      const response = await fetch(`/admin/api/media?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) return setState({ status: 'denied' });
      if (response.status === 400) return setState({ status: 'invalid_query' });
      if (response.status === 503) return setState({ status: 'unavailable' });
      if (!response.ok) return setState({ status: 'error' });
      const parsed = mediaReviewQueueResponseSchema.safeParse(await response.json());
      if (!parsed.success) return setState({ status: 'error' });
      setState({ status: 'ready', items: parsed.data.items, hasMore: parsed.data.hasMore });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(filters, controller.signal);
    return () => controller.abort();
  }, [filters, load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(draft);
  }

  return (
    <div>
      <form
        className="rounded-card border border-border bg-surface p-5 shadow-sm"
        onSubmit={submit}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Review status
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draft.reviewStatus}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  reviewStatus: event.target.value as Filters['reviewStatus'],
                }))
              }
            >
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="superseded">Superseded</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Purpose
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draft.purpose}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  purpose: event.target.value as Filters['purpose'],
                }))
              }
            >
              <option value="">All purposes</option>
              <option value="evidence">Evidence</option>
              <option value="owner_verification">Owner verification</option>
              <option value="public_gallery_candidate">Public gallery candidate</option>
              <option value="public_gallery">Public gallery</option>
              <option value="canonical_logo">Canonical logo</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Visibility
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draft.visibility}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  visibility: event.target.value as Filters['visibility'],
                }))
              }
            >
              <option value="">All visibility</option>
              <option value="private">Private</option>
              <option value="public">Public</option>
              <option value="restricted">Restricted</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraft(defaults);
              setFilters(defaults);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.status === 'loading' ? (
          <StatusPanel
            title="Loading Media queue"
            description="The protected service is loading bounded Media summaries and review state."
            icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
          />
        ) : null}
        {state.status === 'denied' ? (
          <StatusPanel
            title="Media queue access denied"
            description="This verified identity does not have the Media review capability."
            icon={<ShieldAlert className="size-5" />}
          />
        ) : null}
        {state.status === 'invalid_query' ? (
          <StatusPanel
            title="Media filters were rejected"
            description="Reset the bounded queue filters before retrying."
            icon={<AlertTriangle className="size-5" />}
          />
        ) : null}
        {state.status === 'unavailable' || state.status === 'error' ? (
          <StatusPanel
            title="Media queue unavailable"
            description="The protected service could not return a verified queue response."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={() => void load(filters)}>
                Retry queue
              </Button>
            }
          />
        ) : null}
        {state.status === 'ready' && state.items.length === 0 ? (
          <StatusPanel
            title="No Media matches these filters"
            description="The queue returned a valid empty result."
            icon={<CheckCircle2 className="size-5" />}
          />
        ) : null}
        {state.status === 'ready' && state.items.length > 0 ? (
          <section aria-labelledby="media-results-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-brand-700">Protected queue</p>
                <h2 id="media-results-title" className="mt-1 text-2xl font-semibold text-ink">
                  Media summaries
                </h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                <Image className="size-3.5" />
                {state.items.length} loaded{state.hasMore ? ' · more available' : ''}
              </span>
            </div>
            <div className="mt-5 grid gap-4">
              {state.items.map((item) => (
                <QueueCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
