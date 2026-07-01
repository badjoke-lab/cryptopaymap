import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  buildNewTargetFieldProvenancePlan,
  newTargetFieldDescriptors,
  parseFieldSourceSelections,
} from '../../admin/promotion/field-source-selection';
import type { CandidatePromotionReceipt } from '../../admin/promotion/candidate-promotion';
import {
  candidatePromotionEditorRequestSchema,
  type CandidatePromotionWorkspaceResponse,
} from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import {
  AssetSection,
  ClaimSection,
  EntitySection,
  LocationSection,
  type PromotionAssetRow,
} from './CandidatePromotionSections';
import { PromotionFieldSourceControls } from './PromotionFieldSourceControls';

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; receipt: CandidatePromotionReceipt }
  | { status: 'conflict' | 'denied' | 'invalid' | 'unavailable'; message: string };

function text(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

function nullable(value: string): string | null {
  return value.length === 0 ? null : value;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function humanize(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function createAssetRow(): PromotionAssetRow {
  const id = crypto.randomUUID();
  return {
    id,
    key: id,
    assetId: '',
    networkId: '',
    paymentMethodId: '',
    contractAddress: '',
    notes: '',
    isPrimary: true,
  };
}

export function CandidatePromotionForm({
  workspace,
  reload,
}: {
  workspace: CandidatePromotionWorkspaceResponse;
  reload: () => Promise<void>;
}) {
  const candidate = workspace.detail.candidate;
  const physicalCandidate = candidate.candidateType === 'physical_place';
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [assetRows, setAssetRows] = useState<PromotionAssetRow[]>(() => [createAssetRow()]);
  const [draftIds] = useState(() => ({
    entityId: crypto.randomUUID(),
    claimId: crypto.randomUUID(),
    locationId: physicalCandidate ? crypto.randomUUID() : null,
  }));

  const sourceSnapshot = useMemo(
    () =>
      workspace.detail.sources.find((source) => source.snapshot?.kind === candidate.candidateType)
        ?.snapshot ?? null,
    [candidate.candidateType, workspace.detail.sources],
  );
  const physical = sourceSnapshot?.kind === 'physical_place' ? sourceSnapshot : null;
  const online = sourceSnapshot?.kind === 'online_service' ? sourceSnapshot : null;
  const defaultName = sourceSnapshot?.name ?? candidate.name;
  const defaultSlug = slugify(defaultName) || `candidate-${candidate.id.slice(0, 8)}`;
  const provenanceFields = useMemo(
    () => newTargetFieldDescriptors(physicalCandidate, assetRows.map((row) => row.key)),
    [assetRows, physicalCandidate],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const routeType = text(form, 'routeType') as 'direct_wallet' | 'processor_checkout';
    const processorId = routeType === 'processor_checkout' ? nullable(text(form, 'processorId')) : null;

    const entity = {
      id: draftIds.entityId,
      value: {
        entityType: physicalCandidate ? 'merchant' : 'online_service',
        name: text(form, 'entityName'),
        slug: physicalCandidate ? nullable(text(form, 'entitySlug')) : text(form, 'entitySlug'),
        legalName: nullable(text(form, 'legalName')),
        websiteUrl: nullable(text(form, 'entityWebsiteUrl')),
        countryCode: nullable(text(form, 'entityCountryCode').toUpperCase()),
        entityStatus: 'active',
        visibility: 'hidden',
      },
    };
    const location =
      draftIds.locationId === null
        ? null
        : {
            id: draftIds.locationId,
            value: {
              name: nullable(text(form, 'locationName')),
              slug: text(form, 'locationSlug'),
              addressLine: nullable(text(form, 'addressLine')),
              locality: nullable(text(form, 'locality')),
              region: nullable(text(form, 'region')),
              postalCode: nullable(text(form, 'postalCode')),
              countryCode: text(form, 'locationCountryCode').toUpperCase(),
              latitude: Number(text(form, 'latitude')),
              longitude: Number(text(form, 'longitude')),
              locationStatus: 'active',
              visibility: 'hidden',
              websiteUrl: nullable(text(form, 'locationWebsiteUrl')),
              phone: nullable(text(form, 'phone')),
              osmType: nullable(text(form, 'osmType')),
              osmId: text(form, 'osmId').length === 0 ? null : Number(text(form, 'osmId')),
            },
          };
    const claim = {
      id: draftIds.claimId,
      value: {
        entityId: draftIds.entityId,
        locationId: draftIds.locationId,
        claimScope: draftIds.locationId === null ? 'online_service' : 'location_specific',
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
    };
    const claimAssets = assetRows.map((row) => ({
      id: row.id,
      selectionKey: row.key,
      value: {
        claimId: draftIds.claimId,
        assetId: row.assetId,
        networkId: row.networkId,
        paymentMethodId: row.paymentMethodId,
        contractAddress: nullable(row.contractAddress.trim()),
        isPrimary: row.isPrimary,
        notes: nullable(row.notes.trim()),
      },
    }));
    const plan = buildNewTargetFieldProvenancePlan({
      selections: parseFieldSourceSelections(form.get('provenanceSelections')),
      entity,
      location,
      claim,
      claimAssets,
    });
    if (plan.missingFields.length > 0) {
      setSubmitState({
        status: 'invalid',
        message: `Assign at least one source to: ${plan.missingFields.slice(0, 6).join(', ')}${plan.missingFields.length > 6 ? '…' : ''}`,
      });
      return;
    }

    const parsed = candidatePromotionEditorRequestSchema.safeParse({
      expectedCandidateType: candidate.candidateType,
      expectedCandidateUpdatedAt: candidate.updatedAt,
      entity,
      location,
      claim,
      claimAssets: claimAssets.map(({ selectionKey: _selectionKey, ...row }) => row),
      sourceRecordIds: workspace.detail.sources.map((source) => source.id),
      provenanceAssignments: plan.assignments,
    });
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
      setSubmitState({
        status: 'success',
        receipt: (await response.json()) as CandidatePromotionReceipt,
      });
    } catch {
      setSubmitState({
        status: 'unavailable',
        message: 'The promotion request could not be completed.',
      });
    }
  }

  if (submitState.status === 'success') {
    return (
      <section className="rounded-card border border-border bg-surface p-6 shadow-sm">
        <ShieldAlert className="size-6 text-brand-700" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold text-ink">Candidate promoted to hidden canonical records</h2>
        <p className="mt-2 text-sm text-muted">
          {submitState.receipt.canonicalPath} was created with field-level origin provenance. Verification and publication remain separate.
        </p>
        <a className="mt-5 inline-flex text-sm font-semibold text-brand-700" href="/admin/candidates/">Return to Candidate queue</a>
      </section>
    );
  }

  return (
    <div>
      <a className="text-sm font-semibold text-brand-700" href={`/admin/candidates/detail/?id=${encodeURIComponent(candidate.id)}`}>← Back to Candidate detail</a>
      <section className="mt-5 rounded-card border border-border bg-surface p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">{humanize(candidate.candidateType)} · {humanize(candidate.status)}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{candidate.name}</h2>
        <p className="mt-2 break-all text-xs text-muted">Protected ID: {candidate.id}</p>
      </section>

      {!workspace.eligible ? (
        <section className="mt-6 rounded-card border border-warning/50 bg-amber-50 p-5">
          <AlertTriangle className="size-5" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-amber-950">Promotion is blocked</h2>
          <ul className="mt-3 grid gap-2 pl-5 text-sm text-amber-900">
            {workspace.eligibilityIssues.map((issue) => <li key={issue}>{humanize(issue)}</li>)}
          </ul>
        </section>
      ) : null}

      <form className="mt-8 grid gap-8" onSubmit={submit}>
        <fieldset disabled={!workspace.eligible || submitState.status === 'submitting'} className="contents">
          <EntitySection
            candidateType={candidate.candidateType}
            defaultName={defaultName}
            defaultSlug={defaultSlug}
            websiteUrl={sourceSnapshot?.websiteUrl ?? ''}
            countryCode={sourceSnapshot?.countryCode ?? ''}
          />
          {physicalCandidate ? (
            <LocationSection defaultName={physical?.name ?? defaultName} defaultSlug={defaultSlug} snapshot={physical} />
          ) : null}
          <ClaimSection
            workspace={workspace}
            defaults={{
              routeType: online?.routeType ?? 'direct_wallet',
              acceptanceScope: online?.acceptanceScope ?? 'all_checkout',
              howToPay: online?.howToPay ?? '',
              restrictions: online?.scopeNotes ?? '',
            }}
          />
          <AssetSection workspace={workspace} rows={assetRows} setRows={setAssetRows} />
          <PromotionFieldSourceControls fields={provenanceFields} sources={workspace.detail.sources} />
        </fieldset>

        {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
          <p className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950" role="alert">{submitState.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!workspace.eligible || submitState.status === 'submitting'}>
            {submitState.status === 'submitting' ? 'Committing promotion…' : 'Create hidden canonical records'}
          </Button>
          {submitState.status === 'conflict' ? (
            <Button type="button" variant="secondary" onClick={() => void reload()}>Reload current Candidate</Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
