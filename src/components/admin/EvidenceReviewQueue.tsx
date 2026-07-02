import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  evidenceReviewQueueResponseSchema,
  type EvidenceReviewQueueItem,
} from '../../admin/evidence-review/workspace';
import { Button } from '../ui/Button';

type QueueState =
  | { status: 'loading' }
  | { status: 'ready'; items: EvidenceReviewQueueItem[]; hasMore: boolean }
  | { status: 'denied' | 'invalid_query' | 'unavailable' | 'error' };

interface Filters {
  reviewStatus: 'pending' | 'accepted' | 'rejected' | 'superseded';
  evidenceClass: '' | 'a' | 'b' | 'c';
  polarity: '' | 'supporting' | 'contradicting' | 'neutral';
}

const defaults: Filters = {
  reviewStatus: 'pending',
  evidenceClass: '',
  polarity: '',
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
    <section className="rounded-card border border-border bg-surface p-6 shadow-sm" aria-live="polite">
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

function QueueCard({ item }: { item: EvidenceReviewQueueItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            <span>{label(item.evidenceClass)} Evidence</span>
            <span>·</span>
            <span>{label(item.polarity)}</span>
            <span>·</span>
            <span>{label(item.originRole)}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-ink">
            {item.sourceName ?? label(item.sourceType)}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{item.summary}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-semibold text-ink">Claim</dt>
              <dd className="mt-1 text-muted">{label(item.claimStatus)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Review status</dt>
              <dd className="mt-1 text-muted">{label(item.reviewStatus)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Observed</dt>
              <dd className="mt-1 text-muted">{item.observedAt ?? 'Not recorded'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Updated</dt>
              <dd className="mt-1 text-muted">{item.updatedAt}</dd>
            </div>
          </dl>
        </div>
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-brand-700"
          href={`/admin/evidence/detail/?id=${encodeURIComponent(item.id)}`}
        >
          Review Evidence
        </a>
      </div>
    </article>
  );
}

export function EvidenceReviewQueue() {
  const [draft, setDraft] = useState<Filters>(defaults);
  const [filters, setFilters] = useState<Filters>(defaults);
  const [state, setState] = useState<QueueState>({ status: 'loading' });

  const load = useCallback(async (active: Filters, signal?: AbortSignal) => {
    setState({ status: 'loading' });
    const params = new URLSearchParams({ reviewStatus: active.reviewStatus, limit: '50' });
    if (active.evidenceClass) params.set('evidenceClass', active.evidenceClass);
    if (active.polarity) params.set('polarity', active.polarity);
    try {
      const response = await fetch(`/admin/api/evidence?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) return setState({ status: 'denied' });
      if (response.status === 400) return setState({ status: 'invalid_query' });
      if (response.status === 503) return setState({ status: 'unavailable' });
      if (!response.ok) return setState({ status: 'error' });
      const parsed = evidenceReviewQueueResponseSchema.safeParse(await response.json());
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
      <form className="rounded-card border border-border bg-surface p-5 shadow-sm" onSubmit={submit}>
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
            Evidence class
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draft.evidenceClass}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  evidenceClass: event.target.value as Filters['evidenceClass'],
                }))
              }
            >
              <option value="">All classes</option>
              <option value="a">Class A</option>
              <option value="b">Class B</option>
              <option value="c">Class C</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Polarity
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draft.polarity}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  polarity: event.target.value as Filters['polarity'],
                }))
              }
            >
              <option value="">All polarities</option>
              <option value="supporting">Supporting</option>
              <option value="contradicting">Contradicting</option>
              <option value="neutral">Neutral</option>
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
            title="Loading Evidence queue"
            description="The protected service is loading bounded Evidence summaries and Claim states."
            icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
          />
        ) : null}
        {state.status === 'denied' ? (
          <StatusPanel
            title="Evidence queue access denied"
            description="This verified identity does not have the Evidence review capability."
            icon={<ShieldAlert className="size-5" />}
          />
        ) : null}
        {state.status === 'invalid_query' ? (
          <StatusPanel
            title="Evidence filters were rejected"
            description="Reset the bounded queue filters before retrying."
            icon={<AlertTriangle className="size-5" />}
          />
        ) : null}
        {state.status === 'unavailable' || state.status === 'error' ? (
          <StatusPanel
            title="Evidence queue unavailable"
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
            title="No Evidence matches these filters"
            description="The queue returned a valid empty result."
            icon={<CheckCircle2 className="size-5" />}
          />
        ) : null}
        {state.status === 'ready' && state.items.length > 0 ? (
          <section aria-labelledby="evidence-results-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-brand-700">Protected queue</p>
                <h2 id="evidence-results-title" className="mt-1 text-2xl font-semibold text-ink">
                  Evidence summaries
                </h2>
              </div>
              <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
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
