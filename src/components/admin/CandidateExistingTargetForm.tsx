import { Link2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { candidateExistingTargetLinkInputSchema } from '../../admin/promotion/existing-target-link';
import {
  buildExistingTargetFieldProvenancePlan,
  existingTargetFieldDescriptors,
  parseFieldSourceSelections,
} from '../../admin/promotion/field-source-selection';
import type { CandidatePromotionReceipt } from '../../admin/promotion/candidate-promotion';
import type { CandidateCanonicalTargetOption } from '../../admin/promotion/target-selection';
import type { CandidatePromotionWorkspaceResponse } from '../../admin/promotion/workspace';
import { Button } from '../ui/Button';
import { AssetSection } from './PromotionAssetSection';
import type { PromotionAssetRow } from './PromotionAssetTypes';
import { ClaimSection } from './PromotionClaimSection';
import { PromotionFieldSourceControls } from './PromotionFieldSourceControls';

interface Props {
  workspace: CandidatePromotionWorkspaceResponse;
  selectedTarget: CandidateCanonicalTargetOption;
  onConflict: () => void;
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; receipt: CandidatePromotionReceipt }
  | { status: 'invalid' | 'conflict' | 'denied' | 'unavailable'; message: string };

function text(form: FormData, name: string): string {
  const entry = form.get(name);
  return typeof entry === 'string' ? entry.trim() : '';
}

function nullable(value: string): string | null {
  return value.length === 0 ? null : value;
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

export function CandidateExistingTargetForm({ workspace, selectedTarget, onConflict }: Props) {
  const candidate = workspace.detail.candidate;
  const [claimId] = useState(() => crypto.randomUUID());
  const [assetRows, setAssetRows] = useState<PromotionAssetRow[]>(() => [createAssetRow()]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const provenanceFields = useMemo(
    () =>
      existingTargetFieldDescriptors(
        selectedTarget.location !== null,
        assetRows.map((row) => row.key),
      ),
    [assetRows, selectedTarget.location],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState({ status: 'submitting' });
    const form = new FormData(event.currentTarget);
    const routeType = text(form, 'routeType') as 'direct_wallet' | 'processor_checkout';
    const processorId =
      routeType === 'processor_checkout' ? nullable(text(form, 'processorId')) : null;
    const claim = {
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
    };
    const claimAssets = assetRows.map((row) => ({
      id: row.id,
      selectionKey: row.key,
      value: {
        claimId,
        assetId: row.assetId,
        networkId: row.networkId,
        paymentMethodId: row.paymentMethodId,
        contractAddress: nullable(row.contractAddress.trim()),
        isPrimary: row.isPrimary,
        notes: nullable(row.notes.trim()),
      },
    }));
    const plan = buildExistingTargetFieldProvenancePlan({
      selections: parseFieldSourceSelections(form.get('provenanceSelections')),
      entity: {
        id: selectedTarget.entity.id,
        value: {
          name: selectedTarget.entity.name,
          websiteUrl: selectedTarget.entity.websiteUrl,
          countryCode: selectedTarget.entity.countryCode,
        },
      },
      location:
        selectedTarget.location === null
          ? null
          : {
              id: selectedTarget.location.id,
              value: {
                name: selectedTarget.location.name,
                addressLine: selectedTarget.location.addressLine,
                locality: selectedTarget.location.locality,
                region: selectedTarget.location.region,
                postalCode: selectedTarget.location.postalCode,
                countryCode: selectedTarget.location.countryCode,
                latitude: selectedTarget.location.latitude,
                longitude: selectedTarget.location.longitude,
                websiteUrl: selectedTarget.location.websiteUrl,
              },
            },
      claim,
      claimAssets,
    });
    if (plan.missingFields.length > 0) {
      setSubmitState({
        status: 'invalid',
        message: `Assign source coverage for: ${plan.missingFields.slice(0, 6).join(', ')}${plan.missingFields.length > 6 ? '…' : ''}`,
      });
      return;
    }

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
      claim,
      claimAssets: claimAssets.map(({ selectionKey: _selectionKey, ...row }) => row),
      sourceRecordIds: workspace.detail.sources.map((source) => source.id),
      provenanceAssignments: plan.assignments,
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
      <section className="mt-8 rounded-card border border-border bg-surface p-6 shadow-sm">
        <Link2 className="size-5 text-brand-700" aria-hidden="true" />
        <h2 className="mt-3 text-xl font-semibold text-ink">
          Candidate linked to existing canonical target
        </h2>
        <p className="mt-2 text-sm text-muted">
          {submitState.receipt.canonicalPath} received a new hidden candidate Claim. Existing
          identity records were not rewritten.
        </p>
        <a
          className="mt-5 inline-flex text-sm font-semibold text-brand-700"
          href="/admin/candidates/"
        >
          Return to Candidate queue
        </a>
      </section>
    );
  }

  return (
    <form className="mt-8 grid gap-6" onSubmit={submit}>
      <section className="rounded-card border border-brand-600 bg-brand-50 p-5 shadow-sm">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.08em] text-brand-700">
          Selected existing target
        </p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-ink">Candidate</h3>
            <p className="mt-2 text-sm text-muted">{candidate.name}</p>
            <p className="mt-1 text-xs text-muted">Reviewed version: {candidate.updatedAt}</p>
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

      <ClaimSection
        workspace={workspace}
        defaults={{
          routeType: 'direct_wallet',
          acceptanceScope: 'all_checkout',
          howToPay: '',
          restrictions: '',
        }}
      />
      <AssetSection workspace={workspace} rows={assetRows} setRows={setAssetRows} />
      <PromotionFieldSourceControls
        fields={provenanceFields}
        sources={workspace.detail.sources}
        title="Existing-target field source assignments"
        description="Assign Candidate sources to at least one existing identity field as attribution, and to every non-empty new Claim and Claim Asset field as origin."
        badge="Attribution + origin"
      />

      {submitState.status !== 'idle' && submitState.status !== 'submitting' ? (
        <p
          className="rounded-control border border-warning/50 bg-amber-50 p-4 text-sm text-amber-950"
          role="alert"
        >
          {submitState.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={submitState.status === 'submitting'}>
          <Link2 className="size-4" />
          {submitState.status === 'submitting'
            ? 'Linking Candidate…'
            : 'Link Candidate to selected target'}
        </Button>
        {submitState.status === 'conflict' ? (
          <Button type="button" variant="secondary" onClick={onConflict}>
            Search targets again
          </Button>
        ) : null}
      </div>
    </form>
  );
}
