import { and, asc, eq, isNull } from 'drizzle-orm';
import { createDerivedStagingServiceIdentity } from '../src/admin/access/identity';
import {
  authorizeEvidenceReview,
  readEvidenceReviewAuthorizationPolicy,
} from '../src/admin/evidence-review/authorization';
import { createEvidenceReviewDecisionService } from '../src/admin/evidence-review/decision';
import { createDrizzleEvidenceReviewBackend } from '../src/admin/evidence-review/drizzle-backend';
import { createDatabase } from '../src/db/client';
import {
  acceptanceClaims,
  candidatePromotionDecisions,
  candidateSourceRecords,
  claimAssets,
  evidence,
  sourceCandidates,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';

async function deterministicUuid(label: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(label));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Tokyo pilot confirmation outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const policy = readEvidenceReviewAuthorizationPolicy({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: process.env.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS,
  });
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  const reviewerAuthorized = policy.configured && policy.allowedSubjects.has(reviewer.subject);
  if (!reviewerAuthorized) {
    console.log(JSON.stringify({
      target: EXPECTED_TARGET,
      evidenceReviewConfigured: policy.configured,
      reviewerAuthorized: false,
      evidenceBound: false,
      confirmationPerformed: false,
      publicDataChanged: false,
      payloadExposed: false,
    }));
    return;
  }

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      evidenceId: evidence.id,
      evidenceClaimId: evidence.claimId,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(and(
      eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
      isNull(sourceCandidates.duplicateGroupId),
      eq(evidence.evidenceKind, 'official_payment_page'),
      eq(evidence.visibility, 'private'),
    ))
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));
  const uniqueCandidates = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!uniqueCandidates.has(row.candidateId)) uniqueCandidates.set(row.candidateId, row);
  const pilot = [...uniqueCandidates.values()][0];
  if (!pilot) throw new Error('No bounded Tokyo pilot Evidence is available.');

  if (pilot.candidateStatus !== 'promoted') {
    console.log(JSON.stringify({
      target: EXPECTED_TARGET,
      evidenceReviewConfigured: true,
      reviewerAuthorized: true,
      candidatePromoted: false,
      evidenceBound: false,
      confirmationPerformed: false,
      publicDataChanged: false,
      payloadExposed: false,
    }));
    return;
  }

  const [promotion] = await db
    .select({ claimId: candidatePromotionDecisions.claimId })
    .from(candidatePromotionDecisions)
    .where(eq(candidatePromotionDecisions.candidateId, pilot.candidateId))
    .limit(1);
  if (!promotion) throw new Error('Promoted pilot is missing its promotion decision.');

  const [claim] = await db
    .select({
      id: acceptanceClaims.id,
      claimStatus: acceptanceClaims.claimStatus,
      visibility: acceptanceClaims.visibility,
      updatedAt: acceptanceClaims.updatedAt,
    })
    .from(acceptanceClaims)
    .where(eq(acceptanceClaims.id, promotion.claimId))
    .limit(1);
  if (!claim) throw new Error('Promoted pilot Claim is missing.');

  if (claim.claimStatus === 'confirmed' && pilot.evidenceReviewStatus === 'accepted') {
    console.log(JSON.stringify({
      target: EXPECTED_TARGET,
      evidenceReviewConfigured: true,
      reviewerAuthorized: true,
      candidatePromoted: true,
      evidenceBound: pilot.evidenceClaimId === claim.id,
      confirmationPerformed: false,
      alreadyConfirmed: true,
      claimStatus: 'confirmed',
      claimVisibility: claim.visibility,
      publicDataChanged: false,
      payloadExposed: false,
    }));
    return;
  }
  if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
    throw new Error('Pilot Claim is not a hidden candidate Claim before confirmation.');
  }
  if (pilot.evidenceReviewStatus !== 'pending') {
    throw new Error('Pilot Evidence is not pending before confirmation.');
  }

  let evidenceUpdatedAt = pilot.evidenceUpdatedAt;
  let evidenceBound = pilot.evidenceClaimId === claim.id;
  if (pilot.evidenceClaimId === null) {
    const bindAt = new Date(Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, pilot.evidenceUpdatedAt.getTime() + 1_000));
    const [bound] = await db
      .update(evidence)
      .set({ claimId: claim.id, updatedAt: bindAt })
      .where(and(eq(evidence.id, pilot.evidenceId), eq(evidence.reviewStatus, 'pending'), isNull(evidence.claimId)))
      .returning({ claimId: evidence.claimId, updatedAt: evidence.updatedAt });
    if (!bound || bound.claimId !== claim.id) throw new Error('Failed to bind pilot Evidence to promoted Claim.');
    evidenceUpdatedAt = bound.updatedAt;
    evidenceBound = true;
  } else if (pilot.evidenceClaimId !== claim.id) {
    throw new Error('Pilot Evidence is already bound to a different Claim.');
  }

  const acceptedRows = await db
    .select({ id: evidence.id })
    .from(evidence)
    .where(and(eq(evidence.claimId, claim.id), eq(evidence.reviewStatus, 'accepted')))
    .orderBy(asc(evidence.id));
  const assetRows = await db
    .select({ id: claimAssets.id })
    .from(claimAssets)
    .where(eq(claimAssets.claimId, claim.id))
    .orderBy(asc(claimAssets.id));
  if (assetRows.length !== 1) throw new Error('Pilot Claim must have exactly one payment combination.');

  const decidedAt = new Date(Math.max(claim.updatedAt.getTime(), evidenceUpdatedAt.getTime()) + 1_000);
  const nextReviewAt = new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const requestId = await deterministicUuid(`tokyo-hidden-pilot:evidence-review:${pilot.candidateId}`);
  const context = authorizeEvidenceReview(reviewer, policy, requestId);
  const receipt = await createEvidenceReviewDecisionService(createDrizzleEvidenceReviewBackend(db)).decide(context, {
    evidenceId: pilot.evidenceId,
    claimId: claim.id,
    expectedEvidenceUpdatedAt: evidenceUpdatedAt.toISOString(),
    expectedEvidenceReviewStatus: 'pending',
    expectedClaimUpdatedAt: claim.updatedAt.toISOString(),
    expectedClaimStatus: 'candidate',
    expectedClaimVisibility: 'hidden',
    expectedAcceptedEvidenceIds: acceptedRows.map((row) => row.id),
    expectedClaimAssetIds: assetRows.map((row) => row.id),
    decidedAt: decidedAt.toISOString(),
    disposition: 'accepted',
    finding: 'supports_claim',
    claimAction: 'confirm',
    reasonCode: 'official_payment_page_verified',
    publicSummary: null,
    internalNote: 'Bounded fixed-review staging pilot confirmed from reviewed official merchant payment Evidence.',
    nextReviewAt: nextReviewAt.toISOString(),
    endedReason: null,
  });

  console.log(JSON.stringify({
    target: EXPECTED_TARGET,
    evidenceReviewConfigured: true,
    reviewerAuthorized: true,
    candidatePromoted: true,
    evidenceBound,
    confirmationPerformed: receipt.state === 'committed',
    replayed: receipt.state === 'replayed',
    evidenceReviewStatus: receipt.evidenceReviewStatus,
    claimStatus: receipt.claimStatus,
    claimVisibility: receipt.claimVisibility,
    verificationEventType: receipt.verificationEventType,
    publicDataChanged: false,
    payloadExposed: false,
  }));
}

await main();
