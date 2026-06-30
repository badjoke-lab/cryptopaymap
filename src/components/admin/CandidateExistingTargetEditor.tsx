import { AlertTriangle, Link2, Plus, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { candidateExistingTargetLinkInputSchema } from '../../admin/promotion/existing-target-link';
import {
  candidateCanonicalTargetSearchResponseSchema,
  type CandidateCanonicalTargetOption,
} from '../../admin/promotion/target-selection';
import {
  candidatePromotionWorkspaceResponseSchema,
  type CandidatePromotionWorkspaceResponse,
} from '../../admin/promotion/workspace';
import type { CandidatePromotionReceipt } from '../../admin/promotion/candidate-promotion';
import { Button } from '../ui/Button';

type WorkspaceState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: CandidatePromotionWorkspaceResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; targets: CandidateCanonicalTargetOption[]; query: string }
  | { status: 'invalid' | 'conflict' | 'unavailable'; message: string };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; receipt: CandidatePromotionReceipt }
  | { status: 'invalid' | 'conflict' | 'denied' | 'unavailable'; message: string };

interface AssetRow {
  key: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string;
  notes: string;
  isPrimary: boolean;
}

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

function nullable(value: string): string | null {
  return value.length === 0 ? null : value;
}

function createAssetRow(primary: boolean): AssetRow {
  return {
    key: crypto.randomUUID(),
    assetId: '',
    networkId: '',
    paymentMethodId: '',
    contractAddress: '',
    notes: '',
    isPrimary: primary,
  };
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
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [assetRows, setAssetRows] = useState<AssetRow[]>([createAssetRow(true)]);

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

  function updateAssetRow(key: string, patch: Partial<AssetRow>) {
    setAssetRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeAssetRow(key: string) {
    setAssetRows((rows) => {
      const next = rows.filter((row) => row.key !== key);
      if (next.length === 0) return [createAssetRow(true)];
      const first = next[0];
      if (!next.some((row) => row.isPrimary) && first !== undefined) {
        next[0] = { ...first, isPrimary: true };
      }
      return next;
    });
  }

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedTarget === null) return;
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const claimId = crypto.randomUUID();
    const routeType = text(form, 'routeType') as 'direct_wallet' | 'processor_checkout';
    const processorId =
      routeType === 'processor_checkout' ? nullable(text(form, 'processorId')) : null;
    const body = {
      expectedCandidateType: candidate.candidateType,
      expectedCandidateUpdatedAt: candidate.updatedAt,
      target: {
        entityId: selectedTarget.entity.id,
        expectedEntityUpdatedAt: selectedTarget.entity.updatedAt,
        locationId: selectedTarget.location?.id ?? null,
        expectedLocationUpdatedAt: selectedTarget.location?.updatedAt ?? null,
        expectedCanonicalPath: selectedTarget.canonicalPath,
        expectedClaimIds: selectedTarget.expectedClaimIds,
      },
      claim: {
        id: claimId,
        value: {
          entityId: selectedTarget.entity.id,
          locationId: selectedTarget.location?.id ?? null,
          claimScope: selectedTarget.location === null ? 'online_service' : 'location_specific',
          routeType,
          acceptanceScope: text(form, 'acceptanceScope'),
          claimStatus: 'candidate',
          visibility: 'hidden',
          customerPaysCrypto: form.get('customerPaysCrypto') === 'on',
          merchantExplicitlyAcceptsCrypto: form.get('merchantExplicitlyAcceptsCrypto') === 'on',
          processorId,
          howToPay: nullable(text(form, 'howToPay')),
          instructionsLanguage: text(form, 'instructionsLanguage'),
          merchantReceives: text(form, 'merchantReceives'),
          restrictions: nullable(text(form, 'restrictions')),
          firstConfirmedAt: null,
          lastConfirmedAt: null,
          nextReviewAt: null,
          endedAt: null,
          endedReason: null,
        },
      },
      claimAssets: assetRows.map((row) => ({
        id: crypto.randomUUID(),
        value: {
          claimId,
          assetId: row.assetId,
          networkId: row.networkId,
          paymentMethodId: row.paymentMethodId,
          contractAddress: nullable(row.contractAddress.trim()),
          isPrimary: row.isPrimary,
          notes: nullable(row.notes.trim()),
        },
      })),
      sourceRecordIds: workspace.detail.sources.map((source) => source.id),
    };
    const parsed = candidateExistingTargetLinkInputSchema
      .omit({ candidateId: true, linkedAt: true })
      .safeParse(body);
    if (!parsed.success) {
      setSubmitState({
        status: 'invalid',
        message: parsed.error.issues[0]?.message ?? 'The existing-target link draft is invalid.',
      });
      return;
    }
    try {
      const response = await fetch(
        `/admin/api/promotions/${encodeURIComponent(candidate.id)}/existing-target`,
        {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify(parsed.data),
        },
      );
      if (response.status === 403) {
        setSubmitState({
          status: 'denied',
          message: 'This identity cannot link Candidates to canonical targets.',
        });
        return;
      }
      if (response.status === 409) {
        setSubmitState({
          status: 'conflict',
          message:
            'The Candidate or selected canonical target changed. Search again before retrying.',
        });
        return;
      }
      if (response.status === 400) {
        setSubmitState({
          status: 'invalid',
          message: 'The server rejected the existing-target link draft.',
        });
        return;
      }
      if (!response.ok) {
        setSubmitState({
          status: 'unavailable',
          message: 'The existing-target link service is unavailable.',
        });
        return;
      }
      setSubmitState({
        status: 'success',
        receipt: (await response.json()) as CandidatePromotionReceipt,
      });
    } catch {
      setSubmitState({
        status: 'unavailable',
        message: 'The existing-target link request could not be completed.',
      });
    }
  }

  if (submitState.status === 'success') {
    return (
      <StatusPanel
        title="Candidate linked to existing canonical target"
        description={`${submitState.receipt.canonicalPath} received a new hidden candidate Claim. Existing identity records were not rewritten.`}
        icon={<Link2 className="size-5" />}
        action={
          <a className="text-sm font-semibold text-brand-700" href="/admin/candidates/">
            Return to Candidate queue
          </a>
        }
      />
    );
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
          {humanize(candidate.candidateType)} · {workspace.detail.sources.length} exact source
          record{workspace.detail.sources.length === 1 ? '' : 's'}
        </p>
      </section>

      {!workspace.eligible ? (
        <StatusPanel
          title="Target selection is blocked"
          description={workspace.eligibilityIssues.map(humanize).join(', ')}
          icon={<AlertTriangle className="size-5" />}
        />
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
                {searchState.targets.map((target) => (
                  <article
                    key={target.canonicalPath}
                    className={`rounded-card border p-5 shadow-sm ${selectedTarget?.canonicalPath === target.canonicalPath ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface'}`}
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
                        variant={
                          selectedTarget?.canonicalPath === target.canonicalPath
                            ? 'primary'
                            : 'secondary'
                        }
                        onClick={() => setSelectedTarget(target)}
                      >
                        {selectedTarget?.canonicalPath === target.canonicalPath
                          ? 'Selected'
                          : 'Select target'}
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
                ))}
              </div>
            </section>
          ) : null}

          {selectedTarget ? (
            <form className="mt-8 grid gap-6" onSubmit={submitLink}>
              <section className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm">
                <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
                  Selected existing target
                </p>
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">Candidate</h3>
                    <p className="mt-2 text-sm text-muted">{candidate.name}</p>
                    <p className="mt-1 text-xs text-muted">
                      Reviewed version: {candidate.updatedAt}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-ink">Canonical target</h3>
                    <p className="mt-2 text-sm text-muted">
                      {selectedTarget.location?.name ?? selectedTarget.entity.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">{selectedTarget.canonicalPath}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
                <h2 className="text-xl font-semibold text-ink">New hidden candidate Claim</h2>
                <p className="mt-2 text-sm text-muted">
                  Existing identity and Claims remain unchanged. This creates a separate hidden
                  candidate Claim.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    Route type
                    <select
                      className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                      name="routeType"
                      defaultValue="direct_wallet"
                    >
                      <option value="direct_wallet">Direct wallet</option>
                      <option value="processor_checkout">Processor checkout</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    Acceptance scope
                    <select
                      className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                      name="acceptanceScope"
                      defaultValue="all_checkout"
                    >
                      <option value="all_checkout">All checkout</option>
                      <option value="selected_products">Selected products</option>
                      <option value="new_purchase_only">New purchase only</option>
                      <option value="renewal_only">Renewal only</option>
                      <option value="region_limited">Region limited</option>
                      <option value="temporary">Temporary</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    Processor
                    <select
                      className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                      name="processorId"
                      defaultValue=""
                    >
                      <option value="">None</option>
                      {workspace.registries.processors.map((processor) => (
                        <option key={processor.id} value={processor.id}>
                          {processor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    Instructions language
                    <input
                      className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                      name="instructionsLanguage"
                      defaultValue="en"
                      required
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-ink">
                    Merchant receives
                    <select
                      className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                      name="merchantReceives"
                      defaultValue="not_publicly_confirmed"
                    >
                      <option value="crypto">Crypto</option>
                      <option value="fiat">Fiat</option>
                      <option value="crypto_or_fiat">Crypto or fiat</option>
                      <option value="not_publicly_confirmed">Not publicly confirmed</option>
                    </select>
                  </label>
                </div>
                <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
                  How to pay
                  <textarea
                    className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal"
                    name="howToPay"
                  />
                </label>
                <label className="mt-4 grid gap-2 text-sm font-semibold text-ink">
                  Restrictions
                  <textarea
                    className="min-h-24 rounded-control border border-border bg-white px-3 py-2 font-normal"
                    name="restrictions"
                  />
                </label>
                <div className="mt-4 grid gap-3">
                  <label className="flex items-center gap-3 text-sm font-medium text-ink">
                    <input className="size-5" type="checkbox" name="customerPaysCrypto" />
                    Customer pays crypto
                  </label>
                  <label className="flex items-center gap-3 text-sm font-medium text-ink">
                    <input
                      className="size-5"
                      type="checkbox"
                      name="merchantExplicitlyAcceptsCrypto"
                    />
                    Merchant explicitly accepts crypto
                  </label>
                </div>
              </section>

              <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-ink">Claim asset combinations</h2>
                    <p className="mt-2 text-sm text-muted">Select exact registry identities.</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAssetRows((rows) => [...rows, createAssetRow(false)])}
                  >
                    <Plus className="size-4" /> Add combination
                  </Button>
                </div>
                <div className="mt-5 grid gap-4">
                  {assetRows.map((row, index) => (
                    <article
                      key={row.key}
                      className="rounded-control border border-border bg-canvas p-4"
                    >
                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="grid gap-2 text-sm font-semibold text-ink">
                          Asset
                          <select
                            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                            value={row.assetId}
                            onChange={(event) =>
                              updateAssetRow(row.key, { assetId: event.target.value })
                            }
                            required
                          >
                            <option value="">Select asset</option>
                            {workspace.registries.assets.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-semibold text-ink">
                          Network
                          <select
                            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                            value={row.networkId}
                            onChange={(event) =>
                              updateAssetRow(row.key, { networkId: event.target.value })
                            }
                            required
                          >
                            <option value="">Select network</option>
                            {workspace.registries.networks.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-sm font-semibold text-ink">
                          Payment method
                          <select
                            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                            value={row.paymentMethodId}
                            onChange={(event) =>
                              updateAssetRow(row.key, { paymentMethodId: event.target.value })
                            }
                            required
                          >
                            <option value="">Select method</option>
                            {workspace.registries.paymentMethods.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <label className="grid gap-2 text-sm font-semibold text-ink">
                          Contract address
                          <input
                            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                            value={row.contractAddress}
                            onChange={(event) =>
                              updateAssetRow(row.key, { contractAddress: event.target.value })
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-sm font-semibold text-ink">
                          Notes
                          <input
                            className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal"
                            value={row.notes}
                            onChange={(event) =>
                              updateAssetRow(row.key, { notes: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-3 text-sm font-medium text-ink">
                          <input
                            type="radio"
                            name="primaryAsset"
                            checked={row.isPrimary}
                            onChange={() =>
                              setAssetRows((rows) =>
                                rows.map((item) => ({ ...item, isPrimary: item.key === row.key })),
                              )
                            }
                          />
                          Primary combination
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeAssetRow(row.key)}
                          aria-label={`Remove asset combination ${index + 1}`}
                        >
                          <Trash2 className="size-4" /> Remove
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
                <p
                  className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950"
                  role="alert"
                >
                  {submitState.message}
                </p>
              ) : null}
              <Button type="submit" disabled={submitState.status === 'submitting'}>
                <Link2 className="size-4" />
                {submitState.status === 'submitting'
                  ? 'Linking Candidate…'
                  : 'Link Candidate to selected target'}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
