import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { count, eq, inArray } from 'drizzle-orm';
import { createDrizzleCandidatePromotionBackend } from '../src/admin/promotion/drizzle-candidate-promotion-backend';
import {
  CandidatePromotionError,
  createCandidatePromotionService,
  type CandidatePromotionInput,
} from '../src/admin/promotion/candidate-promotion';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  assets,
  candidatePromotionDecisions,
  candidateSourceRecords,
  claimAssets,
  entities,
  exportActivationRecords,
  networks,
  paymentMethods,
  provenanceLinks,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_03';
const evidenceId = 'P6-03';
const expiryHours = 72;
const p601Path = 'config/staging-authorization/p6-01-data-qa-receipt.json';
const p602Path = 'config/staging-authorization/p6-02-identity-admin-receipt.json';
const requiredClasses = [
  'candidate_resolution',
  'location_field_correction',
  'relationship_replacement',
  'business_claim_payment',
  'photos_media_binding',
] as const;

type MutationClass = (typeof requiredClasses)[number];
type ClassStatus = 'passed' | 'missing' | 'failed';

type JsonRecord = Record<string, unknown>;

interface PredecessorReceipt {
  state?: string;
  commit?: string;
  expiresAt?: string;
  binding?: JsonRecord;
}

interface JourneyResult {
  status: 'passed' | 'failed';
  fixtureDigest: string;
  databaseIdentityDigest: string;
  canonicalPreStateDigest: string;
  canonicalPostStateDigest: string;
  applicationReceiptDigest: string;
  auditEventDigest: string;
  rowDeltas: Record<string, number>;
  positive: {
    state: string;
    hiddenCanonicalState: boolean;
  };
  replay: {
    state: string;
    duplicateEffects: number;
  };
  changedContent: {
    result: string;
    duplicateEffects: number;
  };
  staleState: {
    result: string;
    duplicateEffects: number;
  };
  rollback: {
    result: string;
    canonicalRowsAfterFailure: number;
    receiptRowsAfterFailure: number;
    candidateStateRestored: boolean;
  };
  publicationSeparation: {
    activationCountBefore: number;
    activationCountAfter: number;
    unchanged: boolean;
    canonicalVisibility: 'hidden';
    claimVisibility: 'hidden';
  };
  cleanup: {
    status: 'passed' | 'failed';
    remainingFixtureRows: number;
  };
}

interface ReceiptInput {
  approvedCommit: string;
  currentMainCommit: string;
  workflowRunId: string;
  operator: string;
  now: Date;
  p601: PredecessorReceipt | null;
  p602: PredecessorReceipt | null;
  repositoryContractOutcome: string;
  journey: JourneyResult;
  classMatrix: Record<MutationClass, ClassStatus>;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function boundedHash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
}

function readReceipt(root: string, path: string): PredecessorReceipt | null {
  try {
    return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as PredecessorReceipt;
  } catch {
    return null;
  }
}

function validCommit(value: string): boolean {
  return /^[a-f0-9]{40}$/.test(value);
}

function predecessorState(
  receipt: PredecessorReceipt | null,
  approvedCommit: string,
  now: Date,
): 'current' | 'missing' | 'failed' | 'stale' | 'expired' {
  if (receipt === null) return 'missing';
  if (receipt.state !== 'accepted') return 'failed';
  if (receipt.commit !== approvedCommit) return 'stale';
  if (!receipt.expiresAt || Date.parse(receipt.expiresAt) <= now.getTime()) return 'expired';
  return 'current';
}

function bindingMatches(
  left: PredecessorReceipt | null,
  right: PredecessorReceipt | null,
): boolean {
  return (
    left?.binding !== undefined &&
    right?.binding !== undefined &&
    JSON.stringify(stable(left.binding)) === JSON.stringify(stable(right.binding))
  );
}

function buildReceipt(input: ReceiptInput) {
  const p601State = predecessorState(input.p601, input.approvedCommit, input.now);
  const p602State = predecessorState(input.p602, input.approvedCommit, input.now);
  const exceptions: string[] = [];
  if (input.approvedCommit !== input.currentMainCommit) exceptions.push('exact_main:mismatch');
  if (input.repositoryContractOutcome !== 'success') exceptions.push('repository_contract:failed');
  if (p601State !== 'current') exceptions.push(`P6-01:${p601State}`);
  if (p602State !== 'current') exceptions.push(`P6-02:${p602State}`);
  if (!bindingMatches(input.p601, input.p602)) exceptions.push('predecessor_binding:mismatch');
  if (input.journey.status !== 'passed') exceptions.push('candidate_resolution:failed');
  if (input.journey.cleanup.status !== 'passed') exceptions.push('fixture_cleanup:failed');
  for (const mutationClass of requiredClasses) {
    const state = input.classMatrix[mutationClass];
    if (state !== 'passed') exceptions.push(`mutation_class:${mutationClass}:${state}`);
  }
  exceptions.sort();
  const generatedAt = input.now.toISOString();
  const expiresAt = new Date(input.now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString();
  return {
    version: 1,
    evidenceId,
    launchDomain: 'neon_transaction',
    environment: 'configured_staging',
    state: exceptions.length === 0 ? 'accepted' : 'failed',
    commit: input.approvedCommit,
    generatedAt,
    expiresAt,
    workflowRunId: input.workflowRunId,
    operator: boundedHash(input.operator.trim()),
    procedure: 'OPS-P6-001G configured staging Neon transaction evidence',
    checks: {
      exactMain: input.approvedCommit === input.currentMainCommit ? 'success' : 'failure',
      repositoryContract: input.repositoryContractOutcome,
      predecessors: {
        P601: { path: p601Path, state: p601State },
        P602: { path: p602Path, state: p602State },
        bindingMatches: bindingMatches(input.p601, input.p602),
      },
      mutationClassMatrix: input.classMatrix,
      representativeJourney: input.journey,
    },
    binding: input.p601?.binding ?? null,
    exceptions,
  };
}

async function tableCount(
  database: ReturnType<typeof createDatabase>,
  table: Parameters<ReturnType<typeof createDatabase>['select']>[0] extends never
    ? never
    : any,
  column: any,
  id: string,
): Promise<number> {
  const rows = await database.select({ value: count() }).from(table).where(eq(column, id));
  return Number(rows[0]?.value ?? 0);
}

function expectedConflict(error: unknown): boolean {
  return error instanceof CandidatePromotionError && error.code === 'conflict';
}

function buildInput(ids: {
  candidateId: string;
  entityId: string;
  claimId: string;
  claimAssetId: string;
  assetId: string;
  networkId: string;
  paymentMethodId: string;
  sourceRecordId: string;
  slug: string;
  expectedCandidateUpdatedAt: Date;
  promotedAt: Date;
}): CandidatePromotionInput {
  return {
    candidateId: ids.candidateId,
    expectedCandidateType: 'online_service',
    expectedCandidateUpdatedAt: ids.expectedCandidateUpdatedAt.toISOString(),
    promotedAt: ids.promotedAt.toISOString(),
    entity: {
      id: ids.entityId,
      value: {
        entityType: 'online_service',
        name: `P6-03 isolated fixture ${ids.slug}`,
        slug: ids.slug,
        legalName: null,
        websiteUrl: 'https://example.com',
        countryCode: null,
        entityStatus: 'active',
        visibility: 'hidden',
      },
    },
    location: null,
    claim: {
      id: ids.claimId,
      value: {
        entityId: ids.entityId,
        locationId: null,
        claimScope: 'online_service',
        routeType: 'direct_wallet',
        acceptanceScope: 'all_checkout',
        claimStatus: 'candidate',
        visibility: 'hidden',
        customerPaysCrypto: true,
        merchantExplicitlyAcceptsCrypto: true,
        processorId: null,
        howToPay: null,
        instructionsLanguage: 'en',
        merchantReceives: 'not_publicly_confirmed',
        restrictions: null,
        firstConfirmedAt: null,
        lastConfirmedAt: null,
        nextReviewAt: null,
        endedAt: null,
        endedReason: null,
      },
    },
    claimAssets: [
      {
        id: ids.claimAssetId,
        value: {
          claimId: ids.claimId,
          assetId: ids.assetId,
          networkId: ids.networkId,
          paymentMethodId: ids.paymentMethodId,
          contractAddress: null,
          isPrimary: true,
          notes: 'P6-03 isolated configured-staging fixture',
        },
      },
    ],
    sourceRecordIds: [ids.sourceRecordId],
  };
}

async function runCandidateJourney(databaseUrl: string, runLabel: string): Promise<JourneyResult> {
  const database = createDatabase(databaseUrl);
  const backend = createDrizzleCandidatePromotionBackend(database);
  const service = createCandidatePromotionService(backend);
  const now = new Date();
  const candidateUpdatedAt = new Date(now.getTime() - 60_000);
  const slugSuffix = createHash('sha256').update(runLabel).digest('hex').slice(0, 16);
  const fixtureIds = {
    sourceId: crypto.randomUUID(),
    sourceRecordId: crypto.randomUUID(),
    candidateId: crypto.randomUUID(),
    assetId: crypto.randomUUID(),
    networkId: crypto.randomUUID(),
    paymentMethodId: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    claimId: crypto.randomUUID(),
    claimAssetId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    rollbackSourceId: crypto.randomUUID(),
    rollbackSourceRecordId: crypto.randomUUID(),
    rollbackCandidateId: crypto.randomUUID(),
    rollbackEntityId: crypto.randomUUID(),
    rollbackClaimId: crypto.randomUUID(),
    rollbackClaimAssetId: crypto.randomUUID(),
    rollbackRequestId: crypto.randomUUID(),
    nonexistentPaymentMethodId: crypto.randomUUID(),
  };
  const slug = `p6-03-${slugSuffix}`;
  const registrySlug = `p6-03-reg-${slugSuffix}`;
  const subjectIds = [
    fixtureIds.entityId,
    fixtureIds.claimId,
    fixtureIds.claimAssetId,
    fixtureIds.rollbackEntityId,
    fixtureIds.rollbackClaimId,
    fixtureIds.rollbackClaimAssetId,
  ];
  const candidateIds = [fixtureIds.candidateId, fixtureIds.rollbackCandidateId];
  const sourceRecordIds = [fixtureIds.sourceRecordId, fixtureIds.rollbackSourceRecordId];
  const sourceIds = [fixtureIds.sourceId, fixtureIds.rollbackSourceId];
  let cleanupStatus: 'passed' | 'failed' = 'failed';
  let remainingFixtureRows = -1;

  const cleanup = async () => {
    try {
      await database
        .delete(candidatePromotionDecisions)
        .where(
          inArray(candidatePromotionDecisions.requestId, [
            fixtureIds.requestId,
            fixtureIds.rollbackRequestId,
          ]),
        );
      await database.delete(provenanceLinks).where(inArray(provenanceLinks.subjectId, subjectIds));
      await database
        .delete(candidateSourceRecords)
        .where(inArray(candidateSourceRecords.candidateId, candidateIds));
      await database.delete(sourceCandidates).where(inArray(sourceCandidates.id, candidateIds));
      await database
        .delete(claimAssets)
        .where(
          inArray(claimAssets.id, [fixtureIds.claimAssetId, fixtureIds.rollbackClaimAssetId]),
        );
      await database
        .delete(acceptanceClaims)
        .where(inArray(acceptanceClaims.id, [fixtureIds.claimId, fixtureIds.rollbackClaimId]));
      await database
        .delete(entities)
        .where(inArray(entities.id, [fixtureIds.entityId, fixtureIds.rollbackEntityId]));
      await database.delete(sourceRecords).where(inArray(sourceRecords.id, sourceRecordIds));
      await database.delete(sources).where(inArray(sources.id, sourceIds));
      await database.delete(assets).where(eq(assets.id, fixtureIds.assetId));
      await database.delete(networks).where(eq(networks.id, fixtureIds.networkId));
      await database.delete(paymentMethods).where(eq(paymentMethods.id, fixtureIds.paymentMethodId));
      remainingFixtureRows =
        (await tableCount(database, entities, entities.id, fixtureIds.entityId)) +
        (await tableCount(database, entities, entities.id, fixtureIds.rollbackEntityId)) +
        (await tableCount(database, sourceCandidates, sourceCandidates.id, fixtureIds.candidateId)) +
        (await tableCount(
          database,
          sourceCandidates,
          sourceCandidates.id,
          fixtureIds.rollbackCandidateId,
        ));
      cleanupStatus = remainingFixtureRows === 0 ? 'passed' : 'failed';
    } catch {
      cleanupStatus = 'failed';
    }
  };

  try {
    const databaseIdentity = new URL(databaseUrl);
    const databaseIdentityDigest = boundedHash({
      host: databaseIdentity.hostname,
      database: databaseIdentity.pathname,
    });
    const activationBeforeRows = await database.select({ value: count() }).from(exportActivationRecords);
    const activationCountBefore = Number(activationBeforeRows[0]?.value ?? 0);

    await database.insert(sources).values([
      {
        id: fixtureIds.sourceId,
        sourceType: 'other',
        name: `P6-03 fixture source ${slugSuffix}`,
        isActive: true,
        createdAt: candidateUpdatedAt,
        updatedAt: candidateUpdatedAt,
      },
      {
        id: fixtureIds.rollbackSourceId,
        sourceType: 'other',
        name: `P6-03 rollback source ${slugSuffix}`,
        isActive: true,
        createdAt: candidateUpdatedAt,
        updatedAt: candidateUpdatedAt,
      },
    ]);
    await database.insert(sourceRecords).values([
      {
        id: fixtureIds.sourceRecordId,
        sourceId: fixtureIds.sourceId,
        externalId: `p6-03-${slugSuffix}`,
        rawPayload: { schemaVersion: 'p6-03-fixture-v1' },
        fetchedAt: candidateUpdatedAt,
        contentHash: createHash('sha256').update(`${runLabel}:positive`).digest('hex'),
        createdAt: candidateUpdatedAt,
      },
      {
        id: fixtureIds.rollbackSourceRecordId,
        sourceId: fixtureIds.rollbackSourceId,
        externalId: `p6-03-rollback-${slugSuffix}`,
        rawPayload: { schemaVersion: 'p6-03-fixture-v1' },
        fetchedAt: candidateUpdatedAt,
        contentHash: createHash('sha256').update(`${runLabel}:rollback`).digest('hex'),
        createdAt: candidateUpdatedAt,
      },
    ]);
    await database.insert(sourceCandidates).values([
      {
        id: fixtureIds.candidateId,
        candidateType: 'online_service',
        normalizedName: `p6 03 fixture ${slugSuffix}`,
        candidateStatus: 'new',
        firstSeenAt: candidateUpdatedAt,
        lastSeenAt: candidateUpdatedAt,
        createdAt: candidateUpdatedAt,
        updatedAt: candidateUpdatedAt,
      },
      {
        id: fixtureIds.rollbackCandidateId,
        candidateType: 'online_service',
        normalizedName: `p6 03 rollback ${slugSuffix}`,
        candidateStatus: 'new',
        firstSeenAt: candidateUpdatedAt,
        lastSeenAt: candidateUpdatedAt,
        createdAt: candidateUpdatedAt,
        updatedAt: candidateUpdatedAt,
      },
    ]);
    await database.insert(candidateSourceRecords).values([
      {
        candidateId: fixtureIds.candidateId,
        sourceRecordId: fixtureIds.sourceRecordId,
        relationship: 'origin',
        createdAt: candidateUpdatedAt,
      },
      {
        candidateId: fixtureIds.rollbackCandidateId,
        sourceRecordId: fixtureIds.rollbackSourceRecordId,
        relationship: 'origin',
        createdAt: candidateUpdatedAt,
      },
    ]);
    await database.insert(assets).values({
      id: fixtureIds.assetId,
      slug: registrySlug,
      symbol: 'P603',
      name: `P6-03 fixture asset ${slugSuffix}`,
      assetType: 'other',
      isStablecoin: false,
      isWrapped: false,
      status: 'active',
      createdAt: candidateUpdatedAt,
      updatedAt: candidateUpdatedAt,
    });
    await database.insert(networks).values({
      id: fixtureIds.networkId,
      slug: registrySlug,
      name: `P6-03 fixture network ${slugSuffix}`,
      status: 'active',
      createdAt: candidateUpdatedAt,
      updatedAt: candidateUpdatedAt,
    });
    await database.insert(paymentMethods).values({
      id: fixtureIds.paymentMethodId,
      slug: registrySlug,
      name: `P6-03 fixture method ${slugSuffix}`,
      status: 'active',
      createdAt: candidateUpdatedAt,
      updatedAt: candidateUpdatedAt,
    });

    const input = buildInput({
      candidateId: fixtureIds.candidateId,
      entityId: fixtureIds.entityId,
      claimId: fixtureIds.claimId,
      claimAssetId: fixtureIds.claimAssetId,
      assetId: fixtureIds.assetId,
      networkId: fixtureIds.networkId,
      paymentMethodId: fixtureIds.paymentMethodId,
      sourceRecordId: fixtureIds.sourceRecordId,
      slug,
      expectedCandidateUpdatedAt: candidateUpdatedAt,
      promotedAt: now,
    });
    const context = {
      requestId: fixtureIds.requestId,
      actorId: 'cryptopaymap-service:staging-p6-03-operator',
      actorType: 'system' as const,
      capabilities: ['candidate:promote' as const],
    };
    const canonicalPreStateDigest = boundedHash({
      entityRows: await tableCount(database, entities, entities.id, fixtureIds.entityId),
      claimRows: await tableCount(database, acceptanceClaims, acceptanceClaims.id, fixtureIds.claimId),
      receiptRows: await tableCount(
        database,
        candidatePromotionDecisions,
        candidatePromotionDecisions.requestId,
        fixtureIds.requestId,
      ),
    });
    const committed = await service.promote(context, input);
    const postRows = {
      entities: await tableCount(database, entities, entities.id, fixtureIds.entityId),
      claims: await tableCount(database, acceptanceClaims, acceptanceClaims.id, fixtureIds.claimId),
      claimAssets: await tableCount(database, claimAssets, claimAssets.id, fixtureIds.claimAssetId),
      promotionReceipts: await tableCount(
        database,
        candidatePromotionDecisions,
        candidatePromotionDecisions.requestId,
        fixtureIds.requestId,
      ),
      provenanceLinks: Number(
        (
          await database
            .select({ value: count() })
            .from(provenanceLinks)
            .where(inArray(provenanceLinks.subjectId, subjectIds.slice(0, 3)))
        )[0]?.value ?? 0,
      ),
    };
    const canonicalRows = await database
      .select({
        entityVisibility: entities.visibility,
        claimVisibility: acceptanceClaims.visibility,
        claimStatus: acceptanceClaims.claimStatus,
      })
      .from(entities)
      .innerJoin(acceptanceClaims, eq(acceptanceClaims.entityId, entities.id))
      .where(eq(entities.id, fixtureIds.entityId));
    const decisionRows = await database
      .select({
        requestId: candidatePromotionDecisions.requestId,
        candidateId: candidatePromotionDecisions.candidateId,
        entityId: candidatePromotionDecisions.entityId,
        claimId: candidatePromotionDecisions.claimId,
        claimAssetIds: candidatePromotionDecisions.claimAssetIds,
        canonicalPath: candidatePromotionDecisions.canonicalPath,
        promotedAt: candidatePromotionDecisions.promotedAt,
        requestFingerprint: candidatePromotionDecisions.requestFingerprint,
      })
      .from(candidatePromotionDecisions)
      .where(eq(candidatePromotionDecisions.requestId, fixtureIds.requestId));
    const canonicalPostStateDigest = boundedHash({ postRows, canonicalRows });
    const applicationReceiptDigest = boundedHash(committed);
    const auditEventDigest = boundedHash({ decisions: decisionRows, provenance: postRows.provenanceLinks });

    const replay = await service.promote(context, input);
    const receiptCountAfterReplay = await tableCount(
      database,
      candidatePromotionDecisions,
      candidatePromotionDecisions.requestId,
      fixtureIds.requestId,
    );
    let changedContentResult = 'unexpected_success';
    try {
      await service.promote(context, {
        ...input,
        entity: {
          ...input.entity,
          value: { ...input.entity.value, name: `${input.entity.value.name} changed` },
        },
      });
    } catch (error) {
      changedContentResult = expectedConflict(error) ? 'conflict' : 'unexpected_error';
    }
    let staleStateResult = 'unexpected_success';
    try {
      await service.promote({ ...context, requestId: crypto.randomUUID() }, input);
    } catch (error) {
      staleStateResult = expectedConflict(error) ? 'conflict' : 'unexpected_error';
    }

    const rollbackInput = buildInput({
      candidateId: fixtureIds.rollbackCandidateId,
      entityId: fixtureIds.rollbackEntityId,
      claimId: fixtureIds.rollbackClaimId,
      claimAssetId: fixtureIds.rollbackClaimAssetId,
      assetId: fixtureIds.assetId,
      networkId: fixtureIds.networkId,
      paymentMethodId: fixtureIds.nonexistentPaymentMethodId,
      sourceRecordId: fixtureIds.rollbackSourceRecordId,
      slug: `${slug}-rollback`,
      expectedCandidateUpdatedAt: candidateUpdatedAt,
      promotedAt: now,
    });
    let rollbackResult = 'unexpected_success';
    try {
      await service.promote(
        { ...context, requestId: fixtureIds.rollbackRequestId },
        rollbackInput,
      );
    } catch (error) {
      rollbackResult = expectedConflict(error) ? 'rolled_back_conflict' : 'unexpected_error';
    }
    const rollbackCanonicalRows =
      (await tableCount(database, entities, entities.id, fixtureIds.rollbackEntityId)) +
      (await tableCount(
        database,
        acceptanceClaims,
        acceptanceClaims.id,
        fixtureIds.rollbackClaimId,
      )) +
      (await tableCount(database, claimAssets, claimAssets.id, fixtureIds.rollbackClaimAssetId));
    const rollbackReceiptRows = await tableCount(
      database,
      candidatePromotionDecisions,
      candidatePromotionDecisions.requestId,
      fixtureIds.rollbackRequestId,
    );
    const rollbackCandidateRows = await database
      .select({
        status: sourceCandidates.candidateStatus,
        entityId: sourceCandidates.canonicalEntityId,
        locationId: sourceCandidates.canonicalLocationId,
      })
      .from(sourceCandidates)
      .where(eq(sourceCandidates.id, fixtureIds.rollbackCandidateId));
    const candidateStateRestored =
      rollbackCandidateRows[0]?.status === 'new' &&
      rollbackCandidateRows[0]?.entityId === null &&
      rollbackCandidateRows[0]?.locationId === null;

    const activationAfterRows = await database.select({ value: count() }).from(exportActivationRecords);
    const activationCountAfter = Number(activationAfterRows[0]?.value ?? 0);
    const hiddenCanonicalState =
      canonicalRows[0]?.entityVisibility === 'hidden' &&
      canonicalRows[0]?.claimVisibility === 'hidden' &&
      canonicalRows[0]?.claimStatus === 'candidate';
    const passed =
      committed.state === 'committed' &&
      replay.state === 'replayed' &&
      receiptCountAfterReplay === 1 &&
      changedContentResult === 'conflict' &&
      staleStateResult === 'conflict' &&
      rollbackResult === 'rolled_back_conflict' &&
      rollbackCanonicalRows === 0 &&
      rollbackReceiptRows === 0 &&
      candidateStateRestored &&
      hiddenCanonicalState &&
      activationCountAfter === activationCountBefore &&
      Object.values(postRows).every((value) => value > 0);

    await cleanup();
    return {
      status: passed && cleanupStatus === 'passed' ? 'passed' : 'failed',
      fixtureDigest: boundedHash({ runLabel, slugSuffix }),
      databaseIdentityDigest,
      canonicalPreStateDigest,
      canonicalPostStateDigest,
      applicationReceiptDigest,
      auditEventDigest,
      rowDeltas: postRows,
      positive: { state: committed.state, hiddenCanonicalState },
      replay: { state: replay.state, duplicateEffects: Math.max(0, receiptCountAfterReplay - 1) },
      changedContent: {
        result: changedContentResult,
        duplicateEffects: Math.max(0, receiptCountAfterReplay - 1),
      },
      staleState: {
        result: staleStateResult,
        duplicateEffects: Math.max(0, receiptCountAfterReplay - 1),
      },
      rollback: {
        result: rollbackResult,
        canonicalRowsAfterFailure: rollbackCanonicalRows,
        receiptRowsAfterFailure: rollbackReceiptRows,
        candidateStateRestored,
      },
      publicationSeparation: {
        activationCountBefore,
        activationCountAfter,
        unchanged: activationCountAfter === activationCountBefore,
        canonicalVisibility: 'hidden',
        claimVisibility: 'hidden',
      },
      cleanup: { status: cleanupStatus, remainingFixtureRows },
    };
  } catch (error) {
    await cleanup();
    return {
      status: 'failed',
      fixtureDigest: boundedHash({ runLabel }),
      databaseIdentityDigest: boundedHash('unavailable'),
      canonicalPreStateDigest: boundedHash('unavailable'),
      canonicalPostStateDigest: boundedHash('unavailable'),
      applicationReceiptDigest: boundedHash('unavailable'),
      auditEventDigest: boundedHash({
        errorName: error instanceof Error ? error.name : 'unknown',
        postgresCode:
          error !== null && typeof error === 'object' && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : null,
      }),
      rowDeltas: {},
      positive: { state: 'failed', hiddenCanonicalState: false },
      replay: { state: 'failed', duplicateEffects: -1 },
      changedContent: { result: 'not_run', duplicateEffects: -1 },
      staleState: { result: 'not_run', duplicateEffects: -1 },
      rollback: {
        result: 'not_run',
        canonicalRowsAfterFailure: -1,
        receiptRowsAfterFailure: -1,
        candidateStateRestored: false,
      },
      publicationSeparation: {
        activationCountBefore: -1,
        activationCountAfter: -1,
        unchanged: false,
        canonicalVisibility: 'hidden',
        claimVisibility: 'hidden',
      },
      cleanup: { status: cleanupStatus, remainingFixtureRows },
    };
  }
}

async function selfTest() {
  const now = new Date('2026-07-30T00:00:00.000Z');
  const binding = { releaseId: 'sha256:test', dataSnapshotId: 'sha256:data' };
  const predecessor = {
    state: 'accepted',
    commit: 'a'.repeat(40),
    expiresAt: '2026-08-02T00:00:00.000Z',
    binding,
  };
  const journey: JourneyResult = {
    status: 'passed',
    fixtureDigest: boundedHash('fixture'),
    databaseIdentityDigest: boundedHash('database'),
    canonicalPreStateDigest: boundedHash('pre'),
    canonicalPostStateDigest: boundedHash('post'),
    applicationReceiptDigest: boundedHash('receipt'),
    auditEventDigest: boundedHash('audit'),
    rowDeltas: { entities: 1 },
    positive: { state: 'committed', hiddenCanonicalState: true },
    replay: { state: 'replayed', duplicateEffects: 0 },
    changedContent: { result: 'conflict', duplicateEffects: 0 },
    staleState: { result: 'conflict', duplicateEffects: 0 },
    rollback: {
      result: 'rolled_back_conflict',
      canonicalRowsAfterFailure: 0,
      receiptRowsAfterFailure: 0,
      candidateStateRestored: true,
    },
    publicationSeparation: {
      activationCountBefore: 0,
      activationCountAfter: 0,
      unchanged: true,
      canonicalVisibility: 'hidden',
      claimVisibility: 'hidden',
    },
    cleanup: { status: 'passed', remainingFixtureRows: 0 },
  };
  const incomplete = buildReceipt({
    approvedCommit: 'a'.repeat(40),
    currentMainCommit: 'a'.repeat(40),
    workflowRunId: '1',
    operator: 'test-operator',
    now,
    p601: predecessor,
    p602: predecessor,
    repositoryContractOutcome: 'success',
    journey,
    classMatrix: {
      candidate_resolution: 'passed',
      location_field_correction: 'missing',
      relationship_replacement: 'missing',
      business_claim_payment: 'missing',
      photos_media_binding: 'missing',
    },
  });
  if (incomplete.state !== 'failed' || incomplete.exceptions.length !== 4) {
    throw new Error('Incomplete mutation matrix did not fail closed.');
  }
  const complete = buildReceipt({
    approvedCommit: 'a'.repeat(40),
    currentMainCommit: 'a'.repeat(40),
    workflowRunId: '2',
    operator: 'test-operator',
    now,
    p601: predecessor,
    p602: predecessor,
    repositoryContractOutcome: 'success',
    journey,
    classMatrix: Object.fromEntries(requiredClasses.map((key) => [key, 'passed'])) as Record<
      MutationClass,
      ClassStatus
    >,
  });
  if (complete.state !== 'accepted' || complete.exceptions.length !== 0) {
    throw new Error('Complete mutation matrix was not accepted.');
  }
  console.log('OPS-P6-001G configured Neon transaction self-test passed.');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await selfTest();
    return;
  }
  const statusRoot = process.argv[2];
  const outputPath = process.argv[3];
  if (!statusRoot || !outputPath) throw new Error('Status root and output path are required.');
  const approvedCommit = process.env.APPROVED_COMMIT ?? '';
  const currentMainCommit = process.env.CURRENT_MAIN_COMMIT ?? '';
  const confirmation = process.env.CONFIRMATION ?? '';
  const operator = process.env.TRANSACTION_OPERATOR ?? '';
  const workflowRunId = process.env.WORKFLOW_RUN_ID ?? '';
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const repositoryContractOutcome = process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failure';
  if (confirmation !== exactConfirmation) throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  if (!validCommit(approvedCommit) || !validCommit(currentMainCommit)) {
    throw new Error('Approved and current main commits must be lowercase 40-character SHAs.');
  }
  if (!operator.trim()) throw new Error('A bounded transaction operator is required.');
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const now = new Date();
  const p601 = readReceipt(statusRoot, p601Path);
  const p602 = readReceipt(statusRoot, p602Path);
  const journey = await runCandidateJourney(databaseUrl, `${workflowRunId}:${approvedCommit}`);
  const receipt = buildReceipt({
    approvedCommit,
    currentMainCommit,
    workflowRunId,
    operator,
    now,
    p601,
    p602,
    repositoryContractOutcome,
    journey,
    classMatrix: {
      candidate_resolution: journey.status === 'passed' ? 'passed' : 'failed',
      location_field_correction: 'missing',
      relationship_replacement: 'missing',
      business_claim_payment: 'missing',
      photos_media_binding: 'missing',
    },
  });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  if (journey.status !== 'passed' || journey.cleanup.status !== 'passed') {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  await main();
}
