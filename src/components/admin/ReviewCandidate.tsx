import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  candidateDetailResponseSchema,
  type CandidateDetailResponse,
} from '../../admin/candidates/detail';
import { Button } from '../ui/Button';
import { CandidateSourcePanel } from './CandidateSourcePanel';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

type CandidateDetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: CandidateDetailResponse }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
  | { status: 'unavailable' }
  | { status: 'error' };

function humanize(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatDate(value: string): string {
  return `${dateFormatter.format(new Date(value))} UTC`;
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

function SummaryField({ term, value }: { term: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{term}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export function ReviewCandidate() {
  const [state, setState] = useState<CandidateDetailState>({ status: 'loading' });

  const loadDetail = useCallback(async (signal?: AbortSignal) => {
    const candidateId = new URLSearchParams(window.location.search).get('id');
    if (!candidateId) {
      setState({ status: 'missing_id' });
      return;
    }

    setState({ status: 'loading' });
    try {
      const response = await fetch(`/admin/api/candidates/${encodeURIComponent(candidateId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
      if (response.status === 403) {
        setState({ status: 'denied' });
        return;
      }
      if (response.status === 404) {
        setState({ status: 'not_found' });
        return;
      }
      if (response.status === 400) {
        setState({ status: 'missing_id' });
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

      const result = candidateDetailResponseSchema.safeParse(await response.json());
      setState(result.success ? { status: 'ready', detail: result.data } : { status: 'error' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading Candidate detail"
        description="The protected workspace is loading one bounded Candidate record and its source relationships."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }

  if (state.status !== 'ready') {
    const messages = {
      missing_id: [
        'Candidate identifier required',
        'Return to the Candidate queue and choose a record.',
      ],
      denied: [
        'Candidate detail access denied',
        'Your verified identity does not have Candidate read access.',
      ],
      not_found: [
        'Candidate detail not found',
        'The requested Candidate is unavailable or no longer exists.',
      ],
      unavailable: [
        'Candidate detail unavailable',
        'The protected service could not complete safely.',
      ],
      error: [
        'Candidate response could not be verified',
        'No unverified Candidate values are displayed.',
      ],
    } as const;
    const [title, description] = messages[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={
          state.status === 'denied' ? (
            <ShieldAlert className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )
        }
        action={
          state.status === 'unavailable' || state.status === 'error' ? (
            <Button variant="secondary" onClick={() => void loadDetail()}>
              Retry detail
            </Button>
          ) : (
            <a className="text-sm font-semibold text-brand-700" href="/admin/candidates/">
              Return to queue
            </a>
          )
        }
      />
    );
  }

  return <CandidateDetailContent detail={state.detail} />;
}

function CandidateDetailContent({ detail }: { detail: CandidateDetailResponse }) {
  const { candidate, importOrigin } = detail;
  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href="/admin/candidates/">
        ← Back to Candidate queue
      </a>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
              {humanize(candidate.candidateType)} · {humanize(candidate.status)}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {candidate.name}
            </h2>
            <p className="mt-2 break-all text-xs text-muted">Protected ID: {candidate.id}</p>
          </div>
          <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-ink">
            Priority {candidate.priority ?? 'Unscored'}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryField term="First seen" value={formatDate(candidate.firstSeenAt)} />
          <SummaryField term="Last seen" value={formatDate(candidate.lastSeenAt)} />
          <SummaryField term="Updated" value={formatDate(candidate.updatedAt)} />
          <SummaryField
            term="Duplicate signal"
            value={
              candidate.duplicateSignal
                ? humanize(candidate.duplicateGroupStatus ?? 'flagged')
                : 'Not flagged'
            }
          />
          <SummaryField term="Entity link" value={candidate.linkedEntity ? 'Linked' : 'Not linked'} />
          <SummaryField
            term="Location link"
            value={candidate.linkedLocation ? 'Linked' : 'Not linked'}
          />
          <SummaryField term="Source records" value={detail.sources.length} />
          <SummaryField term="Generated" value={formatDate(detail.generatedAt)} />
        </dl>
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="m-0 text-xl font-semibold tracking-tight text-ink">Import origin</h2>
        {importOrigin === null ? (
          <p className="mt-3 text-sm leading-6 text-muted">No import batch is linked to this Candidate.</p>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryField term="Import kind" value={humanize(importOrigin.importKind)} />
            <SummaryField term="Source" value={importOrigin.sourceName} />
            <SummaryField term="Source type" value={humanize(importOrigin.sourceType)} />
            <SummaryField term="Source schema" value={importOrigin.sourceSchemaVersion} />
            <SummaryField term="Importer" value={importOrigin.importerVersion} />
            <SummaryField term="Completed" value={formatDate(importOrigin.completedAt)} />
          </dl>
        )}
      </section>

      <section className="mt-8" aria-labelledby="candidate-sources-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="m-0 text-sm font-semibold text-brand-700">Provenance inspection</p>
            <h2 id="candidate-sources-title" className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              Source relationships
            </h2>
          </div>
          <span className="rounded-pill border border-border px-3 py-1 text-xs font-semibold text-muted">
            {detail.sources.length} loaded
          </span>
        </div>

        {detail.sourcesTruncated ? (
          <p className="mt-4 rounded-control border border-warning/40 bg-amber-50 p-4 text-sm text-amber-900">
            Only the first 100 source records are shown. No additional payloads were returned.
          </p>
        ) : null}

        {detail.sources.length === 0 ? (
          <p className="mt-5 rounded-card border border-border bg-surface p-5 text-sm text-muted">
            No source relationships are attached to this Candidate.
          </p>
        ) : (
          <div className="mt-5 grid gap-4">
            {detail.sources.map((source) => (
              <CandidateSourcePanel key={source.id} source={source} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-card border border-border bg-canvas p-5">
        <h2 className="m-0 text-lg font-semibold text-ink">Read-only boundary</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          This workspace provides inspection only. Duplicate decisions, edits, canonical promotion,
          Evidence decisions, and publication controls are not available in P3-05.
        </p>
      </section>
    </div>
  );
}
