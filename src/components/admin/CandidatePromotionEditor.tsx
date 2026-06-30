import { AlertTriangle, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  candidatePromotionEditorRequestSchema,
  candidatePromotionWorkspaceResponseSchema,
  type CandidatePromotionWorkspaceResponse,
} from '../../admin/promotion/workspace';
import type { CandidatePromotionReceipt } from '../../admin/promotion/candidate-promotion';
import { Button } from '../ui/Button';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: CandidatePromotionWorkspaceResponse }
  | { status: 'missing_id' | 'denied' | 'not_found' | 'unavailable' | 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; receipt: CandidatePromotionReceipt }
  | { status: 'conflict' | 'denied' | 'invalid' | 'unavailable'; message: string };

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function value(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

function nullable(value: string): string | null {
  return value.length === 0 ? null : value;
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

function Field({
  label,
  name,
  defaultValue = '',
  required = false,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <input
        className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal text-ink"
        name={name}
        defaultValue={defaultValue}
        required={required}
        type={type}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue = '',
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      <textarea
        className="min-h-28 rounded-control border border-border bg-white px-3 py-2 font-normal text-ink"
        name={name}
        defaultValue={defaultValue}
      />
    </label>
  );
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

export function CandidatePromotionEditor() {
  const [candidateId, setCandidateId] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    setCandidateId(new URLSearchParams(window.location.search).get('id'));
  }, []);

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      if (candidateId === undefined) return;
      if (!candidateId) return setState({ status: 'missing_id' });
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `/admin/api/promotions/${encodeURIComponent(candidateId)}`,
          {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: signal ?? null,
          },
        );
        if (response.status === 403) return setState({ status: 'denied' });
        if (response.status === 404) return setState({ status: 'not_found' });
        if (response.status === 400) return setState({ status: 'missing_id' });
        if (response.status === 503) return setState({ status: 'unavailable' });
        if (!response.ok) return setState({ status: 'error' });
        const parsed = candidatePromotionWorkspaceResponseSchema.safeParse(await response.json());
        setState(parsed.success ? { status: 'ready', workspace: parsed.data } : { status: 'error' });
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
      missing_id: ['Candidate identifier required', 'Return to the Candidate queue and choose a record.'],
      denied: ['Promotion workspace denied', 'This verified identity cannot read the Candidate promotion workspace.'],
      not_found: ['Candidate not found', 'The requested Candidate is unavailable or no longer exists.'],
      unavailable: ['Promotion workspace unavailable', 'The protected service could not complete safely.'],
      error: ['Promotion response could not be verified', 'No unverified values are displayed.'],
    } as const;
    const [title, description] = messages[state.status];
    return (
      <StatusPanel
        title={title}
        description={description}
        icon={state.status === 'denied' ? <ShieldAlert className="size-5" /> : <AlertTriangle className="size-5" />}
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

  return <PromotionWorkspace workspace={state.workspace} reload={() => loadWorkspace()} />;
}

function PromotionWorkspace({
  workspace,
  reload,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  reload: () => Promise<void>;
}) {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [assetRows, setAssetRows] = useState<AssetRow[]>([createAssetRow(true)]);
  const candidate = workspace.detail.candidate;
  const sourceSnapshot = useMemo(
    () =>
      workspace.detail.sources.find(
        (source) => source.snapshot?.kind === candidate.candidateType,
      )?.snapshot ?? null,
    [candidate.candidateType, workspace.detail.sources],
  );
  const physical = sourceSnapshot?.kind === 'physical_place' ? sourceSnapshot : null;
  const online = sourceSnapshot?.kind === 'online_service' ? sourceSnapshot : null;
  const defaultName = sourceSnapshot?.name ?? candidate.name;
  const defaultSlug = slugify(defaultName) || `candidate-${candidate.id.slice(0, 8)}`;

  function updateAssetRow(key: string, patch: Partial<AssetRow>) {
    setAssetRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeAssetRow(key: string) {
    setAssetRows((rows) => {
      const next = rows.filter((row) => row.key !== key);
      if (next.length === 0) return [createAssetRow(true)];
      if (!next.some((row) => row.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const entityId = crypto.randomUUID();
    const claimId = crypto.randomUUID();
    const locationId = candidate.candidateType === 'physical_place' ? crypto.randomUUID() : null;
    const routeType = value(form, 'routeType') as 'direct_wallet' | 'processor_checkout';
    const processorId = routeType === 'processor_checkout' ? nullable(value(form, 'processorId')) : null;

    const body = {
      expectedCandidateType: candidate.candidateType,
      expectedCandidateUpdatedAt: candidate.updatedAt,
      entity: {
        id: entityId,
        value: {
          entityType: candidate.candidateType === 'physical_place' ? 'merchant' : 'online_service',
          name: value(form, 'entityName'),
          slug: candidate.candidateType === 'online_service' ? value(form, 'entitySlug') : nullable(value(form, 'entitySlug')),
          legalName: nullable(value(form, 'legalName')),
          websiteUrl: nullable(value(form, 'entityWebsiteUrl')),
          countryCode: nullable(value(form, 'entityCountryCode').toUpperCase()),
          entityStatus: 'active',
          visibility: 'hidden',
        },
      },
      location:
        locationId === null
          ? null
          : {
              id: locationId,
              value: {
                name: nullable(value(form, 'locationName')),
                slug: value(form, 'locationSlug'),
                addressLine: nullable(value(form, 'addressLine')),
                locality: nullable(value(form, 'locality')),
                region: nullable(value(form, 'region')),
                postalCode: nullable(value(form, 'postalCode')),
                countryCode: value(form, 'locationCountryCode').toUpperCase(),
                latitude: Number(value(form, 'latitude')),
                longitude: Number(value(form, 'longitude')),
                locationStatus: 'active',
                visibility: 'hidden',
                websiteUrl: nullable(value(form, 'locationWebsiteUrl')),
                phone: nullable(value(form, 'phone')),
                osmType: nullable(value(form, 'osmType')),
                osmId: value(form, 'osmId').length === 0 ? null : Number(value(form, 'osmId')),
              },
            },
      claim: {
        id: claimId,
        value: {
          entityId,
          locationId,
          claimScope: locationId === null ? 'online_service' : 'location_specific',
          routeType,
          acceptanceScope: value(form, 'acceptanceScope'),
          claimStatus: 'candidate',
          visibility: 'hidden',
          customerPaysCrypto: form.get('customerPaysCrypto') === 'on',
          merchantExplicitlyAcceptsCrypto: form.get('merchantExplicitlyAcceptsCrypto') === 'on',
          processorId,
          howToPay: nullable(value(form, 'howToPay')),
          instructionsLanguage: value(form, 'instructionsLanguage'),
          merchantReceives: value(form, 'merchantReceives'),
          restrictions: nullable(value(form, 'restrictions')),
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

    const parsed = candidatePromotionEditorRequestSchema.safeParse(body);
    if (!parsed.success) {
      setSubmitState({
        status: 'invalid',
        message: parsed.error.issues[0]?.message ?? 'The promotion draft is invalid.',
      });
      return;
    }

    try {
      const response = await fetch(`/admin/api/promotions/${encodeURIComponent(candidate.id)}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(parsed.data),
      });
      if (response.status === 403) {
        setSubmitState({ status: 'denied', message: 'This identity cannot promote Candidates.' });
        return;
      }
      if (response.status === 409) {
        setSubmitState({
          status: 'conflict',
          message: 'The Candidate or its source provenance changed. Reload before retrying.',
        });
        return;
      }
      if (response.status === 400) {
        setSubmitState({ status: 'invalid', message: 'The server rejected the promotion draft.' });
        return;
      }
      if (!response.ok) {
        setSubmitState({ status: 'unavailable', message: 'The promotion service is unavailable.' });
        return;
      }
      const receipt = (await response.json()) as CandidatePromotionReceipt;
      setSubmitState({ status: 'success', receipt });
    } catch {
      setSubmitState({ status: 'unavailable', message: 'The promotion request could not be completed.' });
    }
  }

  if (submitState.status === 'success') {
    return (
      <StatusPanel
        title="Candidate promoted to hidden canonical records"
        description={`${submitState.receipt.canonicalPath} was created with a hidden candidate claim. Verification and publication remain separate.`}
        icon={<ShieldAlert className="size-5" />}
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
      <a className="text-sm font-semibold text-brand-700" href={`/admin/candidates/detail/?id=${encodeURIComponent(candidate.id)}`}>
        ← Back to Candidate detail
      </a>

      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
          {humanize(candidate.candidateType)} · {humanize(candidate.status)}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{candidate.name}</h2>
        <p className="mt-2 break-all text-xs text-muted">Protected ID: {candidate.id}</p>
      </section>

      {!workspace.eligible ? (
        <section className="mt-6 rounded-card border border-warning/50 bg-amber-50 p-5">
          <h2 className="m-0 text-lg font-semibold text-amber-950">Promotion is blocked</h2>
          <ul className="mt-3 grid gap-2 pl-5 text-sm text-amber-900">
            {workspace.eligibilityIssues.map((issue) => (
              <li key={issue}>{humanize(issue)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <form className="mt-8 grid gap-8" onSubmit={submit}>
        <fieldset disabled={!workspace.eligible || submitState.status === 'submitting'} className="contents">
          <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <legend className="text-xl font-semibold text-ink">Canonical entity</legend>
            <p className="mt-2 text-sm text-muted">Review every normalized value. The new record remains hidden.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Display name" name="entityName" defaultValue={defaultName} required />
              <Field label="Slug" name="entitySlug" defaultValue={defaultSlug} required={candidate.candidateType === 'online_service'} />
              <Field label="Legal name" name="legalName" />
              <Field label="HTTPS website" name="entityWebsiteUrl" type="url" defaultValue={sourceSnapshot?.websiteUrl ?? ''} />
              <Field label="Country code" name="entityCountryCode" defaultValue={sourceSnapshot?.countryCode ?? ''} />
            </div>
          </section>

          {candidate.candidateType === 'physical_place' ? (
            <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
              <legend className="text-xl font-semibold text-ink">Canonical location</legend>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Location name" name="locationName" defaultValue={physical?.name ?? defaultName} />
                <Field label="Location slug" name="locationSlug" defaultValue={defaultSlug} required />
                <Field label="Address" name="addressLine" defaultValue={physical?.addressLine ?? ''} />
                <Field label="Locality" name="locality" defaultValue={physical?.locality ?? ''} />
                <Field label="Region" name="region" defaultValue={physical?.region ?? ''} />
                <Field label="Postal code" name="postalCode" defaultValue={physical?.postalCode ?? ''} />
                <Field label="Country code" name="locationCountryCode" defaultValue={physical?.countryCode ?? ''} required />
                <Field label="Latitude" name="latitude" type="number" step="any" min={-90} max={90} defaultValue={physical?.latitude ?? ''} required />
                <Field label="Longitude" name="longitude" type="number" step="any" min={-180} max={180} defaultValue={physical?.longitude ?? ''} required />
                <Field label="HTTPS website" name="locationWebsiteUrl" type="url" defaultValue={physical?.websiteUrl ?? ''} />
                <Field label="Phone" name="phone" />
                <label className="grid gap-2 text-sm font-semibold text-ink">
                  OSM type
                  <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="osmType" defaultValue={physical?.osmType ?? ''}>
                    <option value="">None</option>
                    <option value="node">Node</option>
                    <option value="way">Way</option>
                    <option value="relation">Relation</option>
                  </select>
                </label>
                <Field label="OSM ID" name="osmId" type="number" min={1} defaultValue={physical?.osmId ?? ''} />
              </div>
            </section>
          ) : null}

          <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <legend className="text-xl font-semibold text-ink">Candidate acceptance claim</legend>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Route type
                <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="routeType" defaultValue={online?.routeType ?? 'direct_wallet'}>
                  <option value="direct_wallet">Direct wallet</option>
                  <option value="processor_checkout">Processor checkout</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Acceptance scope
                <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="acceptanceScope" defaultValue={online?.acceptanceScope ?? 'all_checkout'}>
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
                <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="processorId" defaultValue="">
                  <option value="">None</option>
                  {workspace.registries.processors.map((processor) => (
                    <option key={processor.id} value={processor.id}>{processor.name}</option>
                  ))}
                </select>
              </label>
              <Field label="Instructions language" name="instructionsLanguage" defaultValue="en" required />
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Merchant receives
                <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" name="merchantReceives" defaultValue="not_publicly_confirmed">
                  <option value="crypto">Crypto</option>
                  <option value="fiat">Fiat</option>
                  <option value="crypto_or_fiat">Crypto or fiat</option>
                  <option value="not_publicly_confirmed">Not publicly confirmed</option>
                </select>
              </label>
            </div>
            <div className="mt-5 grid gap-4">
              <TextArea label="How to pay" name="howToPay" defaultValue={online?.howToPay ?? ''} />
              <TextArea label="Restrictions" name="restrictions" defaultValue={online?.scopeNotes ?? ''} />
              <label className="flex items-center gap-3 text-sm font-medium text-ink">
                <input className="size-5" type="checkbox" name="customerPaysCrypto" />
                Customer pays crypto
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-ink">
                <input className="size-5" type="checkbox" name="merchantExplicitlyAcceptsCrypto" />
                Merchant explicitly accepts crypto
              </label>
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <legend className="text-xl font-semibold text-ink">Claim asset combinations</legend>
                <p className="mt-2 text-sm text-muted">Choose explicit asset, network, and payment-method identities.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setAssetRows((rows) => [...rows, createAssetRow(false)])}>
                <Plus className="size-4" /> Add combination
              </Button>
            </div>
            <div className="mt-5 grid gap-4">
              {assetRows.map((row, index) => (
                <article key={row.key} className="rounded-control border border-border bg-canvas p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="grid gap-2 text-sm font-semibold text-ink">
                      Asset
                      <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.assetId} onChange={(event) => updateAssetRow(row.key, { assetId: event.target.value })} required>
                        <option value="">Select asset</option>
                        {workspace.registries.assets.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-ink">
                      Network
                      <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.networkId} onChange={(event) => updateAssetRow(row.key, { networkId: event.target.value })} required>
                        <option value="">Select network</option>
                        {workspace.registries.networks.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-ink">
                      Payment method
                      <select className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.paymentMethodId} onChange={(event) => updateAssetRow(row.key, { paymentMethodId: event.target.value })} required>
                        <option value="">Select method</option>
                        {workspace.registries.paymentMethods.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-semibold text-ink">Contract address<input className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.contractAddress} onChange={(event) => updateAssetRow(row.key, { contractAddress: event.target.value })} /></label>
                    <label className="grid gap-2 text-sm font-semibold text-ink">Notes<input className="min-h-11 rounded-control border border-border bg-white px-3 py-2 font-normal" value={row.notes} onChange={(event) => updateAssetRow(row.key, { notes: event.target.value })} /></label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-3 text-sm font-medium text-ink">
                      <input type="radio" name="primaryAsset" checked={row.isPrimary} onChange={() => setAssetRows((rows) => rows.map((item) => ({ ...item, isPrimary: item.key === row.key })))} /> Primary combination
                    </label>
                    <Button type="button" variant="ghost" onClick={() => removeAssetRow(row.key)} aria-label={`Remove asset combination ${index + 1}`}>
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </fieldset>

        {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
          <p className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            {submitState.message}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!workspace.eligible || submitState.status === 'submitting'}>
            {submitState.status === 'submitting' ? 'Committing promotion…' : 'Create hidden canonical records'}
          </Button>
          {submitState.status === 'conflict' ? (
            <Button type="button" variant="secondary" onClick={() => void reload()}>
              Reload current Candidate
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
