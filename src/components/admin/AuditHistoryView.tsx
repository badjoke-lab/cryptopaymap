import { AlertTriangle, Clock3, RefreshCw, ScrollText, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  auditHistoryDomainValues,
  auditHistoryResponseSchema,
  auditHistoryTargetTypeValues,
  type AuditHistoryItem,
} from '../../admin/audit-history/contract';
import { Button } from '../ui/Button';

type DomainFilter = '' | (typeof auditHistoryDomainValues)[number];
type TargetTypeFilter = '' | (typeof auditHistoryTargetTypeValues)[number];

interface Filters {
  domain: DomainFilter;
  actorId: string;
  targetType: TargetTypeFilter;
  targetId: string;
  from: string;
  to: string;
}

type ViewState =
  | { status: 'loading' }
  | {
      status: 'ready';
      items: AuditHistoryItem[];
      hasMore: boolean;
      generatedAt: string;
    }
  | { status: 'denied' | 'invalid_query' | 'unavailable' | 'error' };

const emptyFilters: Filters = {
  domain: '',
  actorId: '',
  targetType: '',
  targetId: '',
  from: '',
  to: '',
};

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function optionalIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function buildParams(
  filters: Filters,
  cursor?: { before: string; beforeId: string },
): URLSearchParams {
  const params = new URLSearchParams({ limit: '50' });
  if (filters.domain) params.set('domain', filters.domain);
  if (filters.actorId.trim()) params.set('actorId', filters.actorId.trim());
  if (filters.targetType) params.set('targetType', filters.targetType);
  if (filters.targetId.trim()) params.set('targetId', filters.targetId.trim());
  const from = optionalIso(filters.from);
  const to = optionalIso(filters.to);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (cursor) {
    params.set('before', cursor.before);
    params.set('beforeId', cursor.beforeId);
  }
  return params;
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

function AuditItemCard({ item }: { item: AuditHistoryItem }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {label(item.domain)} · {label(item.sourceKind)}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{label(item.action)}</h3>
        </div>
        <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
          {item.actorType}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-ink">Occurred</dt>
          <dd className="mt-1 text-muted">{item.occurredAt}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Actor</dt>
          <dd className="mt-1 break-all font-mono text-xs text-muted">{item.actorId}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Primary target</dt>
          <dd className="mt-1 text-muted">
            {label(item.target.type)} ·{' '}
            <span className="break-all font-mono text-xs">{item.target.id}</span>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Reason</dt>
          <dd className="mt-1 text-muted">
            {item.reasonCode ? label(item.reasonCode) : 'Not recorded'}
          </dd>
        </div>
      </dl>

      {item.transition ? (
        <p className="mt-4 rounded-control bg-canvas px-3 py-2 text-sm text-muted">
          State: {item.transition.fromState ?? 'none'} → {item.transition.toState ?? 'none'}
        </p>
      ) : null}

      {item.summary ? <p className="mt-4 text-sm leading-6 text-muted">{item.summary}</p> : null}

      {item.secondaryTargets.length > 0 ? (
        <p className="mt-4 text-xs text-muted">
          Secondary targets:{' '}
          {item.secondaryTargets.map((target) => `${label(target.type)} ${target.id}`).join(' · ')}
        </p>
      ) : null}
    </article>
  );
}

export function AuditHistoryView() {
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [state, setState] = useState<ViewState>({ status: 'loading' });
  const [loadingOlder, setLoadingOlder] = useState(false);

  const load = useCallback(
    async (
      activeFilters: Filters,
      options: {
        append?: boolean;
        cursor?: { before: string; beforeId: string };
        signal?: AbortSignal;
      } = {},
    ) => {
      const append = options.append === true;
      if (append) setLoadingOlder(true);
      else setState({ status: 'loading' });

      try {
        const params = buildParams(activeFilters, options.cursor);
        const response = await fetch(`/admin/api/audit-history?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: options.signal ?? null,
        });
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 400) return setState({ status: 'invalid_query' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });

        const parsed = auditHistoryResponseSchema.safeParse(await response.json());
        if (!parsed.success) return setState({ status: 'error' });
        setState((previous) => ({
          status: 'ready',
          items:
            append && previous.status === 'ready'
              ? [...previous.items, ...parsed.data.items]
              : parsed.data.items,
          hasMore: parsed.data.hasMore,
          generatedAt: parsed.data.generatedAt,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      } finally {
        if (append) setLoadingOlder(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(filters, { signal: controller.signal });
    return () => controller.abort();
  }, [filters, load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...draftFilters });
  }

  function reset() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
  }

  function loadOlder() {
    if (state.status !== 'ready' || state.items.length === 0 || loadingOlder) return;
    const last = state.items[state.items.length - 1];
    if (!last) return;
    void load(filters, {
      append: true,
      cursor: { before: last.occurredAt, beforeId: last.id },
    });
  }

  return (
    <div>
      <form
        className="rounded-card border border-border bg-surface p-5 shadow-sm"
        onSubmit={submit}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-ink">
            Domain
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.domain}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  domain: event.target.value as DomainFilter,
                }))
              }
            >
              <option value="">All domains</option>
              {auditHistoryDomainValues.map((domain) => (
                <option key={domain} value={domain}>
                  {label(domain)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            Actor ID
            <input
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.actorId}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, actorId: event.target.value }))
              }
              placeholder="cloudflare-access:…"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            Target type
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.targetType}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  targetType: event.target.value as TargetTypeFilter,
                }))
              }
            >
              <option value="">Any target type</option>
              {auditHistoryTargetTypeValues.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {label(targetType)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            Target ID
            <input
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.targetId}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, targetId: event.target.value }))
              }
              placeholder="Exact target identifier"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            From
            <input
              type="datetime-local"
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.from}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, from: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-ink">
            To
            <input
              type="datetime-local"
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftFilters.to}
              onChange={(event) =>
                setDraftFilters((current) => ({ ...current, to: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit">Apply filters</Button>
          <Button type="button" variant="secondary" onClick={reset}>
            Reset
          </Button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.status === 'loading' ? (
          <StatusPanel
            title="Loading audit history"
            description="The protected service is loading normalized metadata from durable Phase 3 sources."
            icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
          />
        ) : null}
        {state.status === 'denied' ? (
          <StatusPanel
            title="Audit history access denied"
            description="This verified identity does not have the isolated audit read capability."
            icon={<ShieldAlert className="size-5" />}
          />
        ) : null}
        {state.status === 'invalid_query' ? (
          <StatusPanel
            title="Audit history filter rejected"
            description="Check the time range, target filter, and bounded cursor inputs before retrying."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={reset}>
                Reset filters
              </Button>
            }
          />
        ) : null}
        {state.status === 'unavailable' || state.status === 'error' ? (
          <StatusPanel
            title="Audit history unavailable"
            description="The protected service could not return a complete verified history response."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={() => void load(filters)}>
                Retry history
              </Button>
            }
          />
        ) : null}
        {state.status === 'ready' ? (
          <section aria-labelledby="audit-history-results-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-brand-700">
                  Normalized durable history
                </p>
                <h2
                  id="audit-history-results-title"
                  className="mt-1 text-2xl font-semibold text-ink"
                >
                  Audit events
                </h2>
              </div>
              <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                {state.items.length} loaded{state.hasMore ? ' · more available' : ''}
              </span>
            </div>

            {state.items.length === 0 ? (
              <StatusPanel
                title="No audit events match this filter"
                description="The UI does not fabricate missing events. Adjust the bounded filters to inspect another history slice."
                icon={<ScrollText className="size-5" />}
              />
            ) : (
              <div className="mt-4 grid gap-4">
                {state.items.map((item) => (
                  <AuditItemCard key={item.id} item={item} />
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-2">
                <Clock3 className="size-4" aria-hidden="true" /> Generated {state.generatedAt}
              </span>
              {state.hasMore ? (
                <Button variant="secondary" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? 'Loading older events…' : 'Load older events'}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
