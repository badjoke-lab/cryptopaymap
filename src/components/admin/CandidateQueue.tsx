import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  candidateQueueResponseSchema,
  type CandidateQueueItem,
} from '../../admin/candidates/queue';
import { Button } from '../ui/Button';
import {
  buildCandidateQueueUrl,
  CandidateQueueFilters,
  defaultCandidateQueueFilters,
  type CandidateQueueFiltersValue,
} from './CandidateQueueFilters';
import { CandidateSummaryCard } from './CandidateSummaryCard';

const numberFormatter = new Intl.NumberFormat('en-US');

type CandidateQueueState =
  | { status: 'loading' }
  | { status: 'ready'; items: CandidateQueueItem[]; nextCursor: string | null }
  | { status: 'loading_more'; items: CandidateQueueItem[]; nextCursor: string | null }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'invalid_query' }
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

export function CandidateQueue() {
  const [draftFilters, setDraftFilters] = useState<CandidateQueueFiltersValue>(
    defaultCandidateQueueFilters,
  );
  const [filters, setFilters] = useState<CandidateQueueFiltersValue>(defaultCandidateQueueFilters);
  const [state, setState] = useState<CandidateQueueState>({ status: 'loading' });
  const requestSequence = useRef(0);

  const loadQueue = useCallback(
    async (
      activeFilters: CandidateQueueFiltersValue,
      cursor?: string,
      append = false,
      signal?: AbortSignal,
    ) => {
      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;
      setState((current) =>
        append && (current.status === 'ready' || current.status === 'loading_more')
          ? { ...current, status: 'loading_more' }
          : { status: 'loading' },
      );

      try {
        const response = await fetch(buildCandidateQueueUrl(activeFilters, cursor), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: signal ?? null,
        });
        if (requestId !== requestSequence.current) return;

        if (response.status === 403) {
          setState({ status: 'denied' });
          return;
        }
        if (response.status === 400) {
          setState({ status: 'invalid_query' });
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

        const result = candidateQueueResponseSchema.safeParse(await response.json());
        if (requestId !== requestSequence.current) return;
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
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadQueue(filters, undefined, false, controller.signal);
    return () => controller.abort();
  }, [filters, loadQueue]);

  const resetFilters = () => {
    setDraftFilters(defaultCandidateQueueFilters);
    setFilters(defaultCandidateQueueFilters);
  };

  const retry = () => {
    void loadQueue(filters);
  };

  const pageState = state.status === 'ready' || state.status === 'loading_more' ? state : null;
  const currentItems = pageState?.items ?? [];
  const nextCursor = pageState?.nextCursor ?? null;
  const loadingMore = pageState?.status === 'loading_more';

  return (
    <div>
      <CandidateQueueFilters
        value={draftFilters}
        onChange={setDraftFilters}
        onSubmit={() => setFilters(draftFilters)}
        onReset={resetFilters}
      />

      <div className="mt-6" aria-live="polite">
        {state.status === 'loading' ? (
          <StatusPanel
            title="Loading Candidate queue"
            description="The protected queue is loading bounded Candidate summaries. Source payloads and record details are not requested."
            icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
          />
        ) : null}
        {state.status === 'denied' ? (
          <StatusPanel
            title="Candidate queue access denied"
            description="Your verified administration identity does not have the Candidate read capability. No Candidate values were returned."
            icon={<ShieldAlert className="size-5" />}
          />
        ) : null}
        {state.status === 'unavailable' ? (
          <StatusPanel
            title="Candidate queue unavailable"
            description="The protected queue is not configured or could not complete safely. No partial result is displayed."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={retry}>
                Retry queue
              </Button>
            }
          />
        ) : null}
        {state.status === 'invalid_query' ? (
          <StatusPanel
            title="Candidate filters were rejected"
            description="The queue request did not match the bounded filter contract. Reset the filters before trying again."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : null}
        {state.status === 'error' ? (
          <StatusPanel
            title="Candidate queue response could not be verified"
            description="The response was incomplete or invalid. No unverified Candidate values are displayed."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={retry}>
                Retry queue
              </Button>
            }
          />
        ) : null}

        {pageState && currentItems.length === 0 ? (
          <StatusPanel
            title="No Candidates match these filters"
            description="The queue returned a valid empty page. Broaden the filters or reset to the actionable queue."
            icon={<CheckCircle2 className="size-5" />}
          />
        ) : null}

        {currentItems.length > 0 ? (
          <section aria-labelledby="candidate-results-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="m-0 text-sm font-semibold text-brand-700">Protected queue</p>
                <h2
                  id="candidate-results-title"
                  className="mt-1 text-2xl font-semibold tracking-tight text-ink"
                >
                  Candidate summaries
                </h2>
              </div>
              <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                {numberFormatter.format(currentItems.length)} loaded
              </span>
            </div>
            <div className="mt-5 grid gap-4">
              {currentItems.map((item) => (
                <CandidateSummaryCard key={item.id} item={item} />
              ))}
            </div>
            {nextCursor ? (
              <div className="mt-5 flex justify-center">
                <Button
                  variant="secondary"
                  disabled={loadingMore}
                  onClick={() => void loadQueue(filters, nextCursor, true)}
                >
                  {loadingMore ? 'Loading more…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
