import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  candidatePromotionWorkspaceResponseSchema,
  type CandidatePromotionWorkspaceResponse,
} from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import { CandidatePromotionForm } from './CandidatePromotionForm';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: CandidatePromotionWorkspaceResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

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

export function CandidatePromotionEditor() {
  const [candidateId, setCandidateId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setCandidateId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      if (candidateId === undefined) return;
      if (!candidateId) {
        setState({ status: 'missing_id' });
        return;
      }
      setState({ status: 'loading' });
      try {
        const response = await fetch(`/admin/api/promotions/${encodeURIComponent(candidateId)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: signal ?? null,
        });
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 404) return setState({ status: 'not_found' });
        if (response.status === 400) return setState({ status: 'missing_id' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });

        const parsed = candidatePromotionWorkspaceResponseSchema.safeParse(await response.json());
        setState(
          parsed.success ? { status: 'ready', workspace: parsed.data } : { status: 'error' },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      }
    },
    [candidateId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  if (state.status === 'loading') {
    return (
      <StatusPanel
        title="Loading promotion workspace"
        description="The protected service is loading the current Candidate version, exact provenance set, and active payment registries."
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
        'Promotion workspace denied',
        'This verified identity cannot read the Candidate promotion workspace.',
      ],
      not_found: [
        'Candidate not found',
        'The requested Candidate is unavailable or no longer exists.',
      ],
      unavailable: [
        'Promotion workspace unavailable',
        'The protected service could not complete safely.',
      ],
      error: ['Promotion response could not be verified', 'No unverified values are displayed.'],
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
            <Button variant="secondary" onClick={() => void loadWorkspace()}>
              Retry workspace
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

  return <CandidatePromotionForm workspace={state.workspace} reload={() => loadWorkspace()} />;
}
