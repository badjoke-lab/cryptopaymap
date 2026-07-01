import { AlertTriangle, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  candidateCanonicalTargetSearchResponseSchema,
  type CandidateCanonicalTargetOption,
} from '../../admin/promotion/target-selection';
import {
  candidatePromotionWorkspaceResponseSchema,
  type CandidatePromotionWorkspaceResponse,
} from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import { CandidateExistingTargetForm } from './CandidateExistingTargetForm';

type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: CandidatePromotionWorkspaceResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; targets: CandidateCanonicalTargetOption[]; query: string }
  | { status: 'invalid' | 'conflict' | 'unavailable'; message: string };

function humanize(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function text(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
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

export function CandidateExistingTargetEditor() {
  const [candidateId, setCandidateId] = useState<string | null | undefined>(undefined);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({ status: 'loading' });

  useEffect(() => {
    setCandidateId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      if (candidateId === undefined) return;
      if (!candidateId) {
        setWorkspaceState({ status: 'missing_id' });
        return;
      }
      setWorkspaceState({ status: 'loading' });
      try {
        const response = await fetch(`/admin/api/promotions/${encodeURIComponent(candidateId)}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: signal ?? null,
        });
        if (response.status === 403) return setWorkspaceState({ status: 'denied' });
        if (response.status === 404) return setWorkspaceState({ status: 'not_found' });
        if (response.status === 400) return setWorkspaceState({ status: 'missing_id' });
        if (response.status === 503) return setWorkspaceState({ status: 'unavailable' });
        if (!response.ok) return setWorkspaceState({ status: 'error' });
        const parsed = candidatePromotionWorkspaceResponseSchema.safeParse(await response.json());
        setWorkspaceState(
          parsed.success ? { status: 'ready', workspace: parsed.data } : { status: 'error' },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setWorkspaceState({ status: 'error' });
      }
    },
    [candidateId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  if (workspaceState.status === 'loading') {
    return (
      <StatusPanel
        title="Loading existing-target workspace"
        description="The protected service is loading the Candidate version, exact provenance, and active payment registries."
        icon={<RefreshCw className="size-5 animate-spin motion-reduce:animate-none" />}
      />
    );
  }
  if (workspaceState.status !== 'ready') {
    const messages = {
      missing_id: [
        'Candidate identifier required',
        'Return to the Candidate queue and choose a record.',
      ],
      denied: [
        'Existing-target workspace denied',
        'This verified identity cannot read Candidate promotion data.',
      ],
      not_found: [
        'Candidate not found',
        'The requested Candidate is unavailable or no longer exists.',
      ],
      unavailable: [
        'Existing-target workspace unavailable',
        'The protected service could not complete safely.',
      ],
      error: [
        'Workspace response could not be verified',
        'No unverified canonical target data is displayed.',
      ],
    } as const;
    const [title, description] = messages[workspaceState.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={
          workspaceState.status === 'denied' ? (
            <ShieldAlert className="size-5" />
          ) : (
            <AlertTriangle className="size-5" />
          )
        }
        action={
          workspaceState.status === 'unavailable' || workspaceState.status === 'error' ? (
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

  return <ExistingTargetWorkspace workspace={workspaceState.workspace} />;
}

function ExistingTargetWorkspace({
  workspace,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
}) {
  const candidate = workspace.detail.candidate;
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const [selectedTarget, setSelectedTarget] = useState<CandidateCanonicalTargetOption | null>(null);

  async function searchTargets(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = text(new FormData(event.currentTarget), 'query');
    if (query.length < 2) {
      setSearchState({ status: 'invalid', message: 'Enter at least two characters.' });
      return;
    }
    setSearchState({ status: 'searching' });
    setSelectedTarget(null);
    try {
      const response = await fetch(
        `/admin/api/promotions/${encodeURIComponent(candidate.id)}/targets?q=${encodeURIComponent(query)}&limit=15`,
        { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } },
      );
      if (response.status === 409) {
        setSearchState({
          status: 'conflict',
          message: 'The Candidate is no longer eligible for target selection.',
        });
        return;
      }
      if (response.status === 400) {
        setSearchState({ status: 'invalid', message: 'The target search query was rejected.' });
        return;
      }
      if (!response.ok) {
        setSearchState({
          status: 'unavailable',
          message: 'Canonical target search is unavailable.',
        });
        return;
      }
      const parsed = candidateCanonicalTargetSearchResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        setSearchState({
          status: 'unavailable',
          message: 'The target search response could not be verified.',
        });
        return;
      }
      setSearchState({ status: 'ready', targets: parsed.data.targets, query: parsed.data.query });
    } catch {
      setSearchState({
        status: 'unavailable',
        message: 'Canonical target search could not be completed.',
      });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <a
          className="text-brand-700"
          href={`/admin/candidates/detail/?id=${encodeURIComponent(candidate.id)}`}
        >
          ← Candidate detail
        </a>
        <a
          className="text-brand-700"
          href={`/admin/candidates/promotion/?id=${encodeURIComponent(candidate.id)}`}
        >
          Create a new canonical target instead
        </a>
      </div>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
          Candidate under review
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{candidate.name}</h2>
        <p className="mt-2 text-sm text-muted">
          {humanize(candidate.candidateType)} · {workspace.detail.sources.length} exact source record
          {workspace.detail.sources.length === 1 ? '' : 's'}
        </p>
      </section>

      {!workspace.eligible ? (
        <div className="mt-8">
          <StatusPanel
            title="Target selection is blocked"
            description={workspace.eligibilityIssues.map(humanize).join(', ')}
            icon={<AlertTriangle className="size-5" />}
          />
        </div>
      ) : (
        <>
          <form
            className="mt-8 rounded-card border border-border bg-surface p-5 shadow-sm"
            onSubmit={searchTargets}
          >
            <label
              className="grid gap-2 text-sm font-semibold text-ink"
              htmlFor="canonical-target-query"
            >
              Search existing canonical records
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="canonical-target-query"
                name="query"
                className="min-h-11 flex-1 rounded-control border border-border bg-white px-3 py-2 text-ink"
                defaultValue={candidate.name}
                minLength={2}
                maxLength={160}
                required
              />
              <Button type="submit" disabled={searchState.status === 'searching'}>
                <Search className="size-4" />{' '}
                {searchState.status === 'searching' ? 'Searching…' : 'Search targets'}
              </Button>
            </div>
          </form>

          {searchState.status === 'invalid' ||
          searchState.status === 'conflict' ||
          searchState.status === 'unavailable' ? (
            <p
              className="mt-5 rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950"
              role="alert"
            >
              {searchState.message}
            </p>
          ) : null}

          {searchState.status === 'ready' ? (
            <section className="mt-8" aria-labelledby="target-results-title">
              <h2 id="target-results-title" className="text-xl font-semibold text-ink">
                Existing target results
              </h2>
              <p className="mt-2 text-sm text-muted">
                {searchState.targets.length} result{searchState.targets.length === 1 ? '' : 's'} for
                “{searchState.query}”.
              </p>
              <div className="mt-4 grid gap-4">
                {searchState.targets.map((target) => {
                  const selected = selectedTarget?.canonicalPath === target.canonicalPath;
                  return (
                    <article
                      key={target.canonicalPath}
                      className={`rounded-card border p-5 shadow-sm ${selected ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                            {humanize(target.entity.entityType)} ·{' '}
                            {humanize(target.entity.visibility)}
                          </p>
                          <h3 className="mt-2 text-lg font-semibold text-ink">
                            {target.location?.name ?? target.entity.name}
                          </h3>
                          <p className="mt-1 text-sm text-muted">{target.canonicalPath}</p>
                          {target.location ? (
                            <p className="mt-2 text-sm text-muted">
                              {[
                                target.location.addressLine,
                                target.location.locality,
                                target.location.region,
                                target.location.countryCode,
                              ]
                                .filter(Boolean)
                                .join(', ')}
                            </p>
                          ) : (
                            <p className="mt-2 text-sm text-muted">
                              {target.entity.websiteUrl ?? 'No website stored'}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant={selected ? 'primary' : 'secondary'}
                          onClick={() => setSelectedTarget(target)}
                        >
                          {selected ? 'Selected' : 'Select target'}
                        </Button>
                      </div>
                      <div className="mt-4 rounded-control border border-border bg-white/70 p-4">
                        <p className="m-0 text-sm font-semibold text-ink">
                          Existing Claims: {target.existingClaims.length}
                        </p>
                        {target.existingClaims.length === 0 ? (
                          <p className="mt-2 text-sm text-muted">
                            No non-deleted Claims currently target this identity.
                          </p>
                        ) : (
                          <ul className="mt-2 grid gap-2 pl-5 text-sm text-muted">
                            {target.existingClaims.map((claim) => (
                              <li key={claim.id}>
                                {humanize(claim.claimStatus)} · {humanize(claim.routeType)} ·{' '}
                                {humanize(claim.visibility)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {selectedTarget ? (
            <CandidateExistingTargetForm
              workspace={workspace}
              selectedTarget={selectedTarget}
              onConflict={() => {
                setSelectedTarget(null);
                setSearchState({ status: 'idle' });
              }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
