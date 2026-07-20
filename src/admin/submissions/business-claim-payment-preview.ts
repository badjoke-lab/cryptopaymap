import { z } from 'zod';
import {
  acceptanceClaimStatusValues,
  assetStatusValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../../db/schema';
import { suggestPaymentProposalSchema } from '../../submissions/suggest-contract';
import { parseBusinessClaimFieldApplicationEventPayload } from '../../submissions/business-claim-field-application-persistence-contract';
import type { SubmissionApplicationLifecycleRecord } from './application-lifecycle';

const timestampSchema = z.iso.datetime({ offset: true });
const issueSchema = z.string().trim().min(1).max(500);
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const registryAssetSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    symbol: z.string().trim().min(1).max(16),
    status: z.enum(assetStatusValues),
  })
  .strict();
const registryNetworkSchema = z
  .object({ id: z.uuid(), slug: slugSchema, status: z.enum(networkStatusValues) })
  .strict();
const registryPaymentMethodSchema = z
  .object({
    id: z.uuid(),
    slug: z.enum(paymentMethodValues),
    status: z.enum(paymentRegistryStatusValues),
  })
  .strict();
const processorSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(160),
    websiteUrl: z.url().nullable(),
    updatedAt: timestampSchema,
  })
  .strict();
const existingClaimSchema = z
  .object({
    claimId: z.uuid(),
    claimStatus: z.enum(acceptanceClaimStatusValues),
    routeType: z.enum(routeTypeValues),
    processorId: z.uuid().nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const businessClaimPaymentPreviewItemSchema = z
  .object({
    submittedIndex: z.number().int().min(0).max(19),
    proposal: suggestPaymentProposalSchema,
    readiness: z.enum([
      'attach_existing_claim',
      'create_candidate_claim',
      'needs_selection',
      'already_present',
      'blocked',
    ]),
    issues: z.array(issueSchema).max(20),
    asset: registryAssetSchema.nullable(),
    network: registryNetworkSchema.nullable(),
    paymentMethod: registryPaymentMethodSchema.nullable(),
    processor: processorSchema.nullable(),
    compatibleClaims: z.array(existingClaimSchema).max(100),
    selectedClaimId: z.uuid().nullable(),
  })
  .strict();

export const businessClaimPaymentPreviewSchema = z
  .object({
    schemaVersion: z.literal('business-claim-payment-preview-v1'),
    generatedAt: timestampSchema,
    application: z
      .object({
        applicationId: z.uuid(),
        submissionId: z.uuid(),
        sourceDecisionEventId: z.uuid(),
        fieldApplicationEventId: z.uuid(),
        applicationStatus: z.literal('pending'),
        publicationStatus: z.literal('blocked'),
        expectedApplicationUpdatedAt: timestampSchema,
      })
      .strict(),
    target: z
      .object({
        targetType: z.enum(['entity', 'location']),
        targetId: z.uuid(),
        entityId: z.uuid(),
        locationId: z.uuid().nullable(),
      })
      .strict(),
    acceptedDraftCount: z.number().int().min(1).max(20),
    draftSetHash: z.string().regex(/^[a-f0-9]{64}$/),
    readiness: z.enum(['ready', 'needs_selection', 'blocked']),
    items: z.array(businessClaimPaymentPreviewItemSchema).min(1).max(20),
  })
  .strict();

export type BusinessClaimPaymentPreview = z.infer<typeof businessClaimPaymentPreviewSchema>;
export type BusinessClaimPaymentPreviewItem = z.infer<typeof businessClaimPaymentPreviewItemSchema>;

export interface BusinessClaimPaymentPreviewReadContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:business-claim-payment-preview:read'];
}

export interface BusinessClaimPaymentPreviewClaimAssetState {
  rowId: string;
  claimId: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  contractAddress: string | null;
  isPrimary: boolean;
}

export interface BusinessClaimPaymentPreviewClaimState {
  claimId: string;
  entityId: string;
  locationId: string | null;
  claimStatus: string;
  routeType: string;
  processorId: string | null;
  updatedAt: string;
  deletedAt: string | null;
  rows: BusinessClaimPaymentPreviewClaimAssetState[];
}

export interface BusinessClaimPaymentPreviewState {
  application: SubmissionApplicationLifecycleRecord;
  submission: {
    submissionId: string;
    submissionType: string;
    targetType: string | null;
    targetId: string | null;
    workflowStatus: string;
    resolution: string | null;
  };
  sourceDecisionEvent: {
    eventId: string;
    submissionId: string;
    toStatus: string;
    action: string;
  } | null;
  fieldApplicationEvent: {
    eventId: string;
    submissionId: string;
    action: string;
    internalNote: string | null;
  } | null;
  target: {
    targetType: 'entity' | 'location';
    targetId: string;
    entityId: string;
    locationId: string | null;
  } | null;
  claims: BusinessClaimPaymentPreviewClaimState[];
}

export interface BusinessClaimPaymentPreviewBackend {
  readApplicationState(applicationId: string): Promise<BusinessClaimPaymentPreviewState | null>;
  readAssetBySlug(slug: string): Promise<z.infer<typeof registryAssetSchema> | null>;
  readNetworkBySlug(slug: string): Promise<z.infer<typeof registryNetworkSchema> | null>;
  readPaymentMethodBySlug(
    slug: (typeof paymentMethodValues)[number],
  ): Promise<z.infer<typeof registryPaymentMethodSchema> | null>;
  readProcessorCandidates(name: string): Promise<z.infer<typeof processorSchema>[]>;
}

export class BusinessClaimPaymentPreviewError extends Error {
  constructor(
    readonly code:
      | 'unauthorized'
      | 'invalid_request'
      | 'not_found'
      | 'ineligible'
      | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BusinessClaimPaymentPreviewError';
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(canonicalize(value))),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function normalizedUrl(value: string | null): string | null {
  if (value === null) return null;
  const url = new URL(value);
  url.hash = '';
  if (url.pathname === '/') url.pathname = '';
  return url.href.replace(/\/$/, '');
}

function assertEligible(state: BusinessClaimPaymentPreviewState) {
  const { application, submission, sourceDecisionEvent, fieldApplicationEvent, target } = state;
  const payload = parseBusinessClaimFieldApplicationEventPayload(
    fieldApplicationEvent?.internalNote ?? null,
  );
  if (
    application.submissionType !== 'claim' ||
    application.sourceDecisionKind !== 'business_claim_relationship' ||
    application.applicationKind !== 'business_claim_update' ||
    application.applicationStatus !== 'pending' ||
    application.publicationStatus !== 'blocked' ||
    application.applicationReceipt !== null ||
    submission.submissionId !== application.submissionId ||
    submission.submissionType !== 'claim' ||
    submission.workflowStatus !== 'resolved' ||
    submission.resolution !== 'approved' ||
    sourceDecisionEvent === null ||
    sourceDecisionEvent.eventId !== application.sourceDecisionEventId ||
    sourceDecisionEvent.submissionId !== application.submissionId ||
    sourceDecisionEvent.toStatus !== 'resolved' ||
    sourceDecisionEvent.action !== 'business_claim_relationship_approved' ||
    fieldApplicationEvent === null ||
    fieldApplicationEvent.submissionId !== application.submissionId ||
    fieldApplicationEvent.action !== 'business_claim_fields_applied' ||
    payload === null ||
    payload.projection.submissionId !== application.submissionId ||
    payload.projection.paymentApplication === null ||
    payload.projection.paymentApplication.acceptedProposals.length === 0 ||
    target === null ||
    target.targetType !== payload.projection.targetType ||
    target.targetId !== payload.projection.targetId ||
    submission.targetType !== target.targetType ||
    submission.targetId !== target.targetId
  ) {
    throw new BusinessClaimPaymentPreviewError(
      'ineligible',
      'The application is not an exact pending Business Claim payment handoff.',
    );
  }
  return { payload, target };
}

function targetMatches(
  claim: BusinessClaimPaymentPreviewClaimState,
  target: NonNullable<BusinessClaimPaymentPreviewState['target']>,
): boolean {
  if (target.targetType === 'location') {
    return claim.entityId === target.entityId && claim.locationId === target.locationId;
  }
  return claim.entityId === target.entityId && claim.locationId === null;
}

function claimProjection(claim: BusinessClaimPaymentPreviewClaimState) {
  return existingClaimSchema.parse({
    claimId: claim.claimId,
    claimStatus: claim.claimStatus,
    routeType: claim.routeType,
    processorId: claim.processorId,
    updatedAt: claim.updatedAt,
  });
}

async function resolveItem(
  backend: BusinessClaimPaymentPreviewBackend,
  state: BusinessClaimPaymentPreviewState,
  target: NonNullable<BusinessClaimPaymentPreviewState['target']>,
  proposal: z.infer<typeof suggestPaymentProposalSchema>,
  submittedIndex: number,
): Promise<BusinessClaimPaymentPreviewItem> {
  const issues: string[] = [];
  let asset: z.infer<typeof registryAssetSchema> | null = null;
  let network: z.infer<typeof registryNetworkSchema> | null = null;
  let paymentMethod: z.infer<typeof registryPaymentMethodSchema> | null = null;
  let processor: z.infer<typeof processorSchema> | null = null;

  try {
    [asset, network, paymentMethod] = await Promise.all([
      proposal.assetSlug === null ? null : backend.readAssetBySlug(proposal.assetSlug),
      proposal.networkSlug === null ? null : backend.readNetworkBySlug(proposal.networkSlug),
      proposal.paymentMethod === null
        ? null
        : backend.readPaymentMethodBySlug(proposal.paymentMethod),
    ]);
  } catch (error) {
    throw new BusinessClaimPaymentPreviewError(
      'backend_failure',
      'The Business Claim payment registries could not be loaded.',
      { cause: error },
    );
  }

  if (proposal.assetSlug === null)
    issues.push('An Asset slug is required for canonical payment application.');
  else if (asset === null) issues.push(`Asset ${proposal.assetSlug} does not exist.`);
  else if (asset.status !== 'active') issues.push(`Asset ${proposal.assetSlug} is not active.`);

  if (proposal.networkSlug === null)
    issues.push('A Network slug is required for canonical payment application.');
  else if (network === null) issues.push(`Network ${proposal.networkSlug} does not exist.`);
  else if (network.status !== 'active')
    issues.push(`Network ${proposal.networkSlug} is not active.`);

  if (proposal.paymentMethod === null)
    issues.push('A Payment Method is required for canonical payment application.');
  else if (paymentMethod === null)
    issues.push(`Payment Method ${proposal.paymentMethod} does not exist.`);
  else if (paymentMethod.status !== 'active')
    issues.push(`Payment Method ${proposal.paymentMethod} is not active.`);

  if (proposal.routeType === null)
    issues.push('A route type is required for canonical payment application.');
  if (proposal.routeType === 'direct_wallet' && proposal.paymentMethod === 'processor_checkout') {
    issues.push('Direct-wallet proposals cannot use the processor-checkout Payment Method.');
  }
  if (
    proposal.routeType === 'processor_checkout' &&
    proposal.paymentMethod !== 'processor_checkout'
  ) {
    issues.push('Processor-checkout proposals must use the processor-checkout Payment Method.');
  }

  if (proposal.routeType === 'processor_checkout') {
    if (proposal.processor === null) {
      issues.push('Processor checkout requires an exact processor identity.');
    } else {
      let candidates: z.infer<typeof processorSchema>[];
      try {
        candidates = await backend.readProcessorCandidates(proposal.processor.name);
      } catch (error) {
        throw new BusinessClaimPaymentPreviewError(
          'backend_failure',
          'Processor candidates could not be loaded.',
          { cause: error },
        );
      }
      const expectedName = normalizedText(proposal.processor.name);
      const expectedWebsite = normalizedUrl(proposal.processor.websiteUrl);
      const matches = candidates.filter(
        (candidate) =>
          normalizedText(candidate.name) === expectedName &&
          (expectedWebsite === null || normalizedUrl(candidate.websiteUrl) === expectedWebsite),
      );
      if (matches.length === 1) processor = matches[0] ?? null;
      else if (matches.length === 0)
        issues.push('No exact active payment processor matches the submitted identity.');
      else issues.push('Multiple active payment processors match the submitted identity.');
    }
  } else if (proposal.processor !== null) {
    issues.push('Only processor-checkout proposals may reference a processor.');
  }

  const compatible = state.claims
    .filter(
      (claim) =>
        claim.deletedAt === null &&
        ['candidate', 'confirmed', 'stale'].includes(claim.claimStatus) &&
        routeTypeValues.includes(claim.routeType as (typeof routeTypeValues)[number]) &&
        targetMatches(claim, target) &&
        claim.routeType === proposal.routeType &&
        claim.processorId === (processor?.id ?? null),
    )
    .sort((left, right) => left.claimId.localeCompare(right.claimId));

  let readiness: BusinessClaimPaymentPreviewItem['readiness'] = 'blocked';
  let selectedClaimId: string | null = null;
  if (issues.length === 0 && asset !== null && network !== null && paymentMethod !== null) {
    if (compatible.length === 0) {
      readiness = 'create_candidate_claim';
    } else if (compatible.length > 1) {
      readiness = 'needs_selection';
    } else {
      const claim = compatible[0];
      if (claim === undefined) throw new Error('Compatible Claim selection failed.');
      selectedClaimId = claim.claimId;
      const duplicate = claim.rows.some(
        (row) =>
          row.assetId === asset?.id &&
          row.networkId === network?.id &&
          row.paymentMethodId === paymentMethod?.id &&
          row.contractAddress === proposal.contractAddress,
      );
      readiness = duplicate ? 'already_present' : 'attach_existing_claim';
    }
  }

  return businessClaimPaymentPreviewItemSchema.parse({
    submittedIndex,
    proposal,
    readiness,
    issues,
    asset,
    network,
    paymentMethod,
    processor,
    compatibleClaims: compatible.map(claimProjection),
    selectedClaimId,
  });
}

export async function readBusinessClaimPaymentPreview(
  context: BusinessClaimPaymentPreviewReadContext,
  backend: BusinessClaimPaymentPreviewBackend,
  applicationId: string,
  generatedAt = new Date(),
): Promise<BusinessClaimPaymentPreview> {
  if (!context.capabilities.includes('submission:business-claim-payment-preview:read')) {
    throw new BusinessClaimPaymentPreviewError(
      'unauthorized',
      'The actor is not authorized to read Business Claim payment previews.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  if (!applicationIdResult.success || Number.isNaN(generatedAt.getTime())) {
    throw new BusinessClaimPaymentPreviewError(
      'invalid_request',
      'The payment preview request is invalid.',
    );
  }

  let state: BusinessClaimPaymentPreviewState | null;
  try {
    state = await backend.readApplicationState(applicationIdResult.data);
  } catch (error) {
    throw new BusinessClaimPaymentPreviewError(
      'backend_failure',
      'The Business Claim payment application state could not be loaded.',
      { cause: error },
    );
  }
  if (state === null) {
    throw new BusinessClaimPaymentPreviewError(
      'not_found',
      'The Business Claim application was not found.',
    );
  }
  const { payload, target } = assertEligible(state);
  const paymentApplication = payload.projection.paymentApplication;
  if (paymentApplication === null) throw new Error('Eligible payment application is missing.');
  const items = await Promise.all(
    paymentApplication.acceptedProposals.map((proposal, offset) =>
      resolveItem(
        backend,
        state,
        target,
        proposal,
        paymentApplication.acceptedIndexes[offset] ?? offset,
      ),
    ),
  );
  const readiness = items.some((item) => item.readiness === 'blocked')
    ? 'blocked'
    : items.some((item) => item.readiness === 'needs_selection')
      ? 'needs_selection'
      : 'ready';
  const draftSetHash = await sha256({
    submissionId: state.application.submissionId,
    fieldApplicationEventId: state.fieldApplicationEvent?.eventId,
    acceptedIndexes: paymentApplication.acceptedIndexes,
    acceptedProposals: paymentApplication.acceptedProposals,
    items: items.map((item) => ({
      submittedIndex: item.submittedIndex,
      assetId: item.asset?.id ?? null,
      networkId: item.network?.id ?? null,
      paymentMethodId: item.paymentMethod?.id ?? null,
      processorId: item.processor?.id ?? null,
      compatibleClaimIds: item.compatibleClaims.map((claim) => claim.claimId),
      readiness: item.readiness,
    })),
  });

  return businessClaimPaymentPreviewSchema.parse({
    schemaVersion: 'business-claim-payment-preview-v1',
    generatedAt: generatedAt.toISOString(),
    application: {
      applicationId: state.application.applicationId,
      submissionId: state.application.submissionId,
      sourceDecisionEventId: state.application.sourceDecisionEventId,
      fieldApplicationEventId: state.fieldApplicationEvent?.eventId,
      applicationStatus: state.application.applicationStatus,
      publicationStatus: state.application.publicationStatus,
      expectedApplicationUpdatedAt: state.application.updatedAt,
    },
    target,
    acceptedDraftCount: items.length,
    draftSetHash,
    readiness,
    items,
  });
}
