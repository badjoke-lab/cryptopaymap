import { AlertTriangle, CheckCircle2, FileArchive, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  exportReleaseQueueResponseSchema,
  type ExportReleaseDecisionSummary,
} from '../../admin/export-release/workspace';
import { Button } from '../ui/Button';

type QueueState =
  | { status: 'loading' }
  | {
      status: 'ready';
      candidate: z.infer<typeof exportReleaseQueueResponseSchema>['currentCandidate'];
      decisions: ExportReleaseDecisionSummary[];
      hasMore: boolean;
    }
  | { status: 'denied' | 'invalid_query' | 'unavailable' | 'error' };

type ReleaseStatusFilter = '' | 'approved' | 'rejected';

function label(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function shortDigest(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-12)}`;
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

function DecisionCard({ decision }: { decision: ExportReleaseDecisionSummary }) {
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            {label(decision.action)} · {label(decision.releaseStatus)}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-ink">{decision.datasetVersion}</h3>
        </div>
        <span className="rounded-pill border border-border bg-canvas px-3 py-1 text-xs font-semibold text-muted">
          {label(decision.candidateStatus)}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="font-semibold text-ink">Snapshot</dt>
          <dd className="mt-1 font-mono text-xs text-muted">{shortDigest(decision.snapshotDigest)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Artifacts</dt>
          <dd className="mt-1 text-muted">{decision.artifactCount}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Issues</dt>
          <dd className="mt-1 text-muted">{decision.validationIssueCount}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">Decided</dt>
          <dd className="mt-1 text-muted">{decision.decidedAt}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted">{decision.publicSummary ?? label(decision.reasonCode)}</p>
    </article>
  );
}

export function ExportReleaseQueue() {
  const [draftStatus, setDraftStatus] = useState<ReleaseStatusFilter>('');
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatusFilter>('');
  const [state, setState] = useState<QueueState>({ status: 'loading' });

  const load = useCallback(async (filter: ReleaseStatusFilter, signal?: AbortSignal) => {
    setState({ status: 'loading' });
    const params = new URLSearchParams({ limit: '50' });
    if (filter) params.set('releaseStatus', filter);
    try {
      const response = await fetch(`/admin/api/exports?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) return setState({ status: 'denied' });
      if (response.status === 400) return setState({ status: 'invalid_query' });
      if (response.status === 503) return setState({ status: 'unavailable' });
      if (!response.ok) return setState({ status: 'error' });
      const parsed = exportReleaseQueueResponseSchema.safeParse(await response.json());
      if (!parsed.success) return setState({ status: 'error' });
      setState({
        status: 'ready',
        candidate: parsed.data.currentCandidate,
        decisions: parsed.data.recentDecisions,
        hasMore: parsed.data.hasMore,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(releaseStatus, controller.signal);
    return () => controller.abort();
  }, [load, releaseStatus]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReleaseStatus(draftStatus);
  }

  return (
    <div>
      <form className="rounded-card border border-border bg-surface p-5 shadow-sm" onSubmit={submit}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid min-w-56 gap-2 text-sm font-semibold text-ink">
            Release history status
            <select
              className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value as ReleaseStatusFilter)}
            >
              <option value="">All decisions</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <Button type="submit">Apply filter</Button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {state.status === 'loading' ? (
          <StatusPanel
            title="Loading export release workspace"
            description="The protected service is revalidating the private candidate and loading durable release history."
            icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
          />
        ) : null}
        {state.status === 'denied' ? (
          <StatusPanel
            title="Export release access denied"
            description="This verified identity does not have the export release capability."
            icon={<ShieldAlert className="size-5" />}
          />
        ) : null}
        {state.status === 'invalid_query' ? (
          <StatusPanel
            title="Release history filter rejected"
            description="Reset the bounded filter before retrying."
            icon={<AlertTriangle className="size-5" />}
          />
        ) : null}
        {state.status === 'unavailable' || state.status === 'error' ? (
          <StatusPanel
            title="Export release workspace unavailable"
            description="The protected service could not return a verified candidate and release history."
            icon={<AlertTriangle className="size-5" />}
            action={
              <Button variant="secondary" onClick={() => void load(releaseStatus)}>
                Retry workspace
              </Button>
            }
          />
        ) : null}
        {state.status === 'ready' ? (
          <div className="grid gap-8">
            <section aria-labelledby="current-export-candidate-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-semibold text-brand-700">Private candidate</p>
                  <h2 id="current-export-candidate-title" className="mt-1 text-2xl font-semibold text-ink">
                    Current release candidate
                  </h2>
                </div>
                <FileArchive className="size-5 text-muted" aria-hidden="true" />
              </div>
              {state.candidate === null ? (
                <div className="mt-4">
                  <StatusPanel
                    title="No private candidate is available"
                    description="No candidate metadata is fabricated. Generate and store a private candidate before review."
                    icon={<CheckCircle2 className="size-5" />}
                  />
                </div>
              ) : (
                <article className="mt-4 rounded-card border border-brand-200 bg-brand-50 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-800">
                        {label(state.candidate.status)}
                      </p>
                      <h3 className="mt-2 text-xl font-semibold text-ink">
                        {state.candidate.metadata?.datasetVersion ?? 'Release metadata unavailable'}
                      </h3>
                    </div>
                    <a
                      className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-brand-700"
                      href={`/admin/exports/detail/?digest=${encodeURIComponent(state.candidate.snapshotDigest)}`}
                    >
                      Review candidate
                    </a>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="font-semibold text-ink">Snapshot</dt><dd className="mt-1 font-mono text-xs text-muted">{shortDigest(state.candidate.snapshotDigest)}</dd></div>
                    <div><dt className="font-semibold text-ink">Artifacts</dt><dd className="mt-1 text-muted">{state.candidate.artifactCount}</dd></div>
                    <div><dt className="font-semibold text-ink">Validation issues</dt><dd className="mt-1 text-muted">{state.candidate.validationIssueCount}</dd></div>
                    <div><dt className="font-semibold text-ink">Generated</dt><dd className="mt-1 text-muted">{state.candidate.metadata?.generatedAt ?? 'Unavailable'}</dd></div>
                  </dl>
                </article>
              )}
            </section>

            <section aria-labelledby="release-history-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-semibold text-brand-700">Durable history</p>
                  <h2 id="release-history-title" className="mt-1 text-2xl font-semibold text-ink">
                    Release decisions
                  </h2>
                </div>
                <span className="rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                  {state.decisions.length} loaded{state.hasMore ? ' · more available' : ''}
                </span>
              </div>
              {state.decisions.length === 0 ? (
                <p className="mt-4 rounded-card border border-border bg-surface p-5 text-sm text-muted">
                  No durable release decisions match this filter.
                </p>
              ) : (
                <div className="mt-4 grid gap-4">
                  {state.decisions.map((decision) => (
                    <DecisionCard key={decision.requestId} decision={decision} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
