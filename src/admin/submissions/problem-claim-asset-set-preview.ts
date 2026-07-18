import { z } from 'zod';
import {
  assetStatusValues,
  networkStatusValues,
  paymentMethodValues,
  paymentRegistryStatusValues,
  routeTypeValues,
} from '../../db/schema';
import { claimAssetPublicationContextSchema } from '../../schemas/claim-assets';
import { parseProblemReportDecisionEvent } from '../../submissions/problem-report-decision-contract';
import type { SubmissionApplicationLifecycleRecord } from './application-lifecycle';
import { problemReportReviewProjectionSchema } from './report-detail';

const timestampSchema = z.iso.datetime({ offset: true });
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const issueSchema = z.string().trim().min(1).max(500);

const registryAssetSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    symbol: z.string().trim().min(1).max(16),
    status: z.enum(assetStatusValues),
  })
  .strict();
const registryNetworkSchema = z
  .object({
    id: z.uuid(),
    slug: slugSchema,
    status: z.enum(networkStatusValues),
  })
  .strict();
const registryPaymentMethodSchema = z
  .object({
    id: z.uuid(),
    slug: z.enum(paymentMethodValues),
    status: z.enum(paymentRegistryStatusValues),
  })
  .strict();

const projectedRowSchema = z
  .object({
    rowId: z.uuid(),
    asset: registryAssetSchema,
    network: registryNetworkSchema,
    paymentMethod: registryPaymentMethodSchema,
    contractAddress: z.string().trim().min(1).max(256).nullable(),
    isPrimary: z.boolean(),
    notesPresent: z.boolean(),
  })
  .strict();

export const problemClaimAssetSetPreviewSchema = z
  .object({
    schemaVersion: z.literal('problem-claim-asset-set-preview-v1'),
    generatedAt: timestampSchema,
    application: z
      .object({
        applicationId: z.uuid(),
        submissionId: z.uuid(),
        sourceDecisionEventId: z.uuid(),
        applicationStatus: z.literal('pending'),
        publicationStatus: z.literal('blocked'),
        expectedApplicationUpdatedAt: timestampSchema,
      })
      .strict(),
    correction: z
      .object({
        reportType: z.enum(['wrong_asset', 'wrong_network']),
        kind: z.enum(['asset', 'network']),
        proposedSlug: slugSchema,
      })
      .strict(),
    target: z
      .object({
        claimId: z.uuid(),
        claimStatus: z.enum(['confirmed', 'stale']),
        routeType: z.enum(routeTypeValues),
        expectedClaimUpdatedAt: timestampSchema,
      })
      .strict(),
    readiness: z.enum(['ready', 'needs_selection', 'already_matches', 'blocked']),
    issues: z.array(issueSchema).max(100),
    selectedCurrentRowId: z.uuid().nullable(),
    currentSetHash: z.string().regex(/^[a-f0-9]{64}$/),
    proposedSetHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    currentSet: z.array(projectedRowSchema).max(50),
    proposedSet: z.array(projectedRowSchema).max(50).nullable(),
  })
  .strict();

export type ProblemClaimAssetSetPreview = z.infer<typeof problemClaimAssetSetPreviewSchema>;

export interface ProblemClaimAssetSetPreviewReadContext {
  actorId: string;
  actorType: 'human' | 'system';
  capabilities: ['submission:problem-claim-asset-preview:read'];
}

export interface ProblemClaimAssetSetRowState {
  rowId: string;
  claimId: string;
  asset: z.infer<typeof registryAssetSchema>;
  network: z.infer<typeof registryNetworkSchema>;
  paymentMethod: z.infer<typeof registryPaymentMethodSchema>;
  contractAddress: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface ProblemClaimAssetSetPreviewState {
  application: SubmissionApplicationLifecycleRecord;
  submission: {
    submissionId: string;
    submissionType: string;
    targetType: string | null;
    targetId: string | null;
    workflowStatus: string;
    resolution: string | null;
    normalizedPayload: unknown;
  };
  sourceDecisionEvent: {
    eventId: string;
    submissionId: string;
    toStatus: string;
    action: string;
    internalNote: string | null;
  } | null;
  claim: {
    claimId: string;
    claimStatus: string;
    routeType: string;
    updatedAt: string;
    deletedAt: string | null;
  } | null;
  rows: ProblemClaimAssetSetRowState[];
}

export interface ProblemClaimAssetSetPreviewBackend {
  readApplicationState(applicationId: string): Promise<ProblemClaimAssetSetPreviewState | null>;
  readAssetBySlug(slug: string): Promise<z.infer<typeof registryAssetSchema> | null>;
  readNetworkBySlug(slug: string): Promise<z.infer<typeof registryNetworkSchema> | null>;
}

export class ProblemClaimAssetSetPreviewError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'invalid_request' | 'not_found' | 'ineligible' | 'backend_failure',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProblemClaimAssetSetPreviewError';
  }
}

interface CorrectionPlan {
  reportType: 'wrong_asset' | 'wrong_network';
  kind: 'asset' | 'network';
  proposedSlug: string;
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

async function deterministicUuid(label: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertDecisionChain(state: ProblemClaimAssetSetPreviewState): CorrectionPlan {
  const { application, submission, sourceDecisionEvent, claim } = state;
  const decision = parseProblemReportDecisionEvent(sourceDecisionEvent?.internalNote ?? null);
  const projection = problemReportReviewProjectionSchema.safeParse(submission.normalizedPayload);
  const reportType = decision?.reportType;
  const correction = decision?.proposedCorrection;
  const supported =
    (reportType === 'wrong_asset' && correction?.kind === 'asset') ||
    (reportType === 'wrong_network' && correction?.kind === 'network');

  if (
    application.submissionType !== 'problem_report' ||
    application.sourceDecisionKind !== 'problem_correction_handoff' ||
    application.applicationKind !== 'problem_correction' ||
    application.applicationStatus !== 'pending' ||
    application.publicationStatus !== 'blocked' ||
    application.applicationReceipt !== null ||
    application.submissionId !== submission.submissionId ||
    submission.submissionType !== 'problem_report' ||
    submission.targetType !== 'claim' ||
    submission.targetId === null ||
    submission.workflowStatus !== 'resolved' ||
    submission.resolution !== 'approved' ||
    sourceDecisionEvent === null ||
    sourceDecisionEvent.eventId !== application.sourceDecisionEventId ||
    sourceDecisionEvent.submissionId !== application.submissionId ||
    sourceDecisionEvent.toStatus !== 'resolved' ||
    sourceDecisionEvent.action !== 'problem_correction_handoff_approved' ||
    decision === null ||
    decision.operation !== 'approve_correction_handoff' ||
    !supported ||
    !projection.success ||
    projection.data.targetType !== 'claim' ||
    projection.data.targetId !== submission.targetId ||
    projection.data.reportType !== reportType ||
    JSON.stringify(projection.data.proposedCorrection) !== JSON.stringify(correction) ||
    claim === null ||
    claim.claimId !== submission.targetId ||
    !['confirmed', 'stale'].includes(claim.claimStatus) ||
    !routeTypeValues.includes(claim.routeType as (typeof routeTypeValues)[number]) ||
    claim.deletedAt !== null
  ) {
    throw new ProblemClaimAssetSetPreviewError(
      'ineligible',
      'The application is not an exact pending Claim Asset or Network correction handoff.',
    );
  }

  return correction.kind === 'asset'
    ? { reportType: 'wrong_asset', kind: 'asset', proposedSlug: correction.assetSlug }
    : { reportType: 'wrong_network', kind: 'network', proposedSlug: correction.networkSlug };
}

function internalRow(row: ProblemClaimAssetSetRowState) {
  return {
    rowId: row.rowId,
    claimId: row.claimId,
    assetId: row.asset.id,
    assetSlug: row.asset.slug,
    assetStatus: row.asset.status,
    networkId: row.network.id,
    networkSlug: row.network.slug,
    networkStatus: row.network.status,
    paymentMethodId: row.paymentMethod.id,
    paymentMethodSlug: row.paymentMethod.slug,
    paymentMethodStatus: row.paymentMethod.status,
    contractAddress: row.contractAddress,
    isPrimary: row.isPrimary,
    notes: row.notes,
  };
}

function projectedRow(row: ProblemClaimAssetSetRowState): z.infer<typeof projectedRowSchema> {
  return {
    rowId: row.rowId,
    asset: row.asset,
    network: row.network,
    paymentMethod: row.paymentMethod,
    contractAddress: row.contractAddress,
    isPrimary: row.isPrimary,
    notesPresent: row.notes !== null,
  };
}

function combinationIssues(
  routeType: (typeof routeTypeValues)[number],
  rows: readonly ProblemClaimAssetSetRowState[],
): string[] {
  const issues: string[] = [];
  if (rows.length === 0) issues.push('The Claim has no current payment combination.');
  if (rows.filter((row) => row.isPrimary).length !== 1) {
    issues.push('The Claim Asset set must contain exactly one primary combination.');
  }
  for (const row of rows) {
    if (row.claimId === '' || row.asset.id === '' || row.network.id === '') {
      issues.push('The Claim Asset set contains an incomplete row.');
      continue;
    }
    const result = claimAssetPublicationContextSchema.safeParse({
      routeType,
      networkSlug: row.network.slug,
      paymentMethodSlug: row.paymentMethod.slug,
      assetStatus: row.asset.status,
      networkStatus: row.network.status,
      paymentMethodStatus: row.paymentMethod.status,
    });
    for (const issue of result.success ? [] : result.error.issues) {
      issues.push(`${row.asset.symbol} on ${row.network.slug}: ${issue.message}`);
    }
  }
  return issues;
}

async function readRegistryProposal(
  backend: ProblemClaimAssetSetPreviewBackend,
  plan: CorrectionPlan,
): Promise<
  | { kind: 'asset'; asset: z.infer<typeof registryAssetSchema> }
  | { kind: 'network'; network: z.infer<typeof registryNetworkSchema> }
  | null
> {
  try {
    if (plan.kind === 'asset') {
      const asset = await backend.readAssetBySlug(plan.proposedSlug);
      return asset === null ? null : { kind: 'asset', asset };
    }
    const network = await backend.readNetworkBySlug(plan.proposedSlug);
    return network === null ? null : { kind: 'network', network };
  } catch (error) {
    throw new ProblemClaimAssetSetPreviewError(
      'backend_failure',
      'The proposed Claim Asset registry entry could not be loaded.',
      { cause: error },
    );
  }
}

export async function readProblemClaimAssetSetPreview(
  context: ProblemClaimAssetSetPreviewReadContext,
  backend: ProblemClaimAssetSetPreviewBackend,
  applicationId: string,
  generatedAt = new Date(),
): Promise<ProblemClaimAssetSetPreview> {
  if (!context.capabilities.includes('submission:problem-claim-asset-preview:read')) {
    throw new ProblemClaimAssetSetPreviewError(
      'unauthorized',
      'The actor is not authorized to read Claim Asset replacement previews.',
    );
  }
  const applicationIdResult = z.uuid().safeParse(applicationId);
  if (!applicationIdResult.success || Number.isNaN(generatedAt.getTime())) {
    throw new ProblemClaimAssetSetPreviewError(
      'invalid_request',
      'The Claim Asset replacement preview request is invalid.',
    );
  }

  let state: ProblemClaimAssetSetPreviewState | null;
  try {
    state = await backend.readApplicationState(applicationIdResult.data);
  } catch (error) {
    throw new ProblemClaimAssetSetPreviewError(
      'backend_failure',
      'The Claim Asset replacement preview could not be loaded.',
      { cause: error },
    );
  }
  if (state === null) {
    throw new ProblemClaimAssetSetPreviewError(
      'not_found',
      'The Claim Asset replacement application was not found.',
    );
  }

  const plan = assertDecisionChain(state);
  const claim = state.claim as NonNullable<ProblemClaimAssetSetPreviewState['claim']>;
  const routeType = claim.routeType as (typeof routeTypeValues)[number];
  const rows = [...state.rows].sort((left, right) => left.rowId.localeCompare(right.rowId));
  if (rows.length > 50 || rows.some((row) => row.claimId !== claim.claimId)) {
    throw new ProblemClaimAssetSetPreviewError(
      'ineligible',
      'The Claim Asset set is not a bounded exact set for this Claim.',
    );
  }

  const currentSetHash = await sha256(rows.map(internalRow));
  const currentSet = rows.map(projectedRow);
  const issues = combinationIssues(routeType, rows);
  const proposal = await readRegistryProposal(backend, plan);
  if (proposal === null) issues.push(`The proposed ${plan.kind} is not registered.`);
  if (proposal?.kind === 'asset' && proposal.asset.status !== 'active') {
    issues.push('The proposed Asset registry entry is not active.');
  }
  if (proposal?.kind === 'network' && proposal.network.status !== 'active') {
    issues.push('The proposed Network registry entry is not active.');
  }

  let readiness: ProblemClaimAssetSetPreview['readiness'] = 'blocked';
  let selectedCurrentRowId: string | null = null;
  let proposedSet: ProblemClaimAssetSetPreview['proposedSet'] = null;
  let proposedSetHash: string | null = null;

  if (issues.length === 0 && rows.length > 1) {
    readiness = 'needs_selection';
    issues.push('Multiple Claim Asset rows require a separately reviewed row-selection plan.');
  } else if (issues.length === 0 && rows.length === 1 && proposal !== null) {
    const current = rows[0] as ProblemClaimAssetSetRowState;
    const matches =
      proposal.kind === 'asset'
        ? current.asset.slug === proposal.asset.slug
        : current.network.slug === proposal.network.slug;
    selectedCurrentRowId = current.rowId;
    if (matches) {
      readiness = 'already_matches';
      issues.push('The proposed registry value already matches the canonical Claim Asset row.');
    } else {
      const replacementRowId = await deterministicUuid(
        `problem-claim-asset-replacement:${state.application.applicationId}:${state.application.sourceDecisionEventId}:${current.rowId}:${plan.kind}:${plan.proposedSlug}`,
      );
      const replacement: ProblemClaimAssetSetRowState = {
        ...current,
        rowId: replacementRowId,
        asset: proposal.kind === 'asset' ? proposal.asset : current.asset,
        network: proposal.kind === 'network' ? proposal.network : current.network,
      };
      const proposedIssues = combinationIssues(routeType, [replacement]);
      if (proposedIssues.length > 0) {
        issues.push(...proposedIssues);
      } else {
        readiness = 'ready';
        proposedSet = [projectedRow(replacement)];
        proposedSetHash = await sha256([internalRow(replacement)]);
      }
    }
  }

  return problemClaimAssetSetPreviewSchema.parse({
    schemaVersion: 'problem-claim-asset-set-preview-v1',
    generatedAt: generatedAt.toISOString(),
    application: {
      applicationId: state.application.applicationId,
      submissionId: state.application.submissionId,
      sourceDecisionEventId: state.application.sourceDecisionEventId,
      applicationStatus: 'pending',
      publicationStatus: 'blocked',
      expectedApplicationUpdatedAt: state.application.updatedAt,
    },
    correction: plan,
    target: {
      claimId: claim.claimId,
      claimStatus: claim.claimStatus,
      routeType,
      expectedClaimUpdatedAt: claim.updatedAt,
    },
    readiness,
    issues,
    selectedCurrentRowId,
    currentSetHash,
    proposedSetHash,
    currentSet,
    proposedSet,
  });
}
