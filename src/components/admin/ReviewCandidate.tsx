import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  candidateDetailResponseSchema,
  type CandidateDetailResponse,
} from '../../admin/candidates/detail';
import { Button } from '../ui/Button';
import { CandidateSourcePanel } from './CandidateSourcePanel';

type CandidateDetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: CandidateDetailResponse }
  | { status: 'missing_id' }
  | { status: 'denied' }
  | { status: 'not_found' }
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

export function ReviewCandidate() {
  const [state, setState] = useState<CandidateDetailState>({ status: 'loading' });

  const loadDetail = useCallback(async () => {
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
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadDetail();
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
      missing_id: ['Candidate identifier required', 'Return to the Candidate queue and choose a record.'],
      denied: ['Candidate detail access denied', 'Your verified identity does not have Candidate read access.'],
      not_found: ['Candidate detail not found', 'The requested Candidate is unavailable or no longer exists.'],
      unavailable: ['Candidate detail unavailable', 'The protected service could not complete safely.'],
      error: ['Candidate response could not be verified', 'No unverified Candidate values are displayed.'],
    } as const;
    const [title, description] = messages[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={state.status === 'denied' ? <ShieldAlert className="size-5" /> : <AlertTriangle className="size-5" />}
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
  return (
    <div>
      <h2 className="text-2xl font-semibold text-ink">{detail.candidate.name}</h2>
      <div className="mt-6 grid gap-4">
        {detail.sources.map((source) => (
          <CandidateSourcePanel key={source.id} source={source} />
        ))}
      </div>
    </div>
  );
}
