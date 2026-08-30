import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
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
const EXPECTED_CANDIDATE_HASH = '52d2304917b9d88e1a598cccfa2bdf592cd3dc8a506a78edf2ec725bbde45ba2';
const EXPECTED_EVIDENCE_UPDATED_AT = '2026-08-30T03:16:03.378Z';
const REVIEW_BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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
    throw new Error('Refusing reviewed Europe-west confirmation outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const policy = readEvidenceReviewAuthorizationPolicy({
    CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS: process.env.CPM_ADMIN_EVIDENCE_REVIEW_SUBJECTS,
  });
  const reviewer = createDerivedStagingServiceIdentity('reviewer');
  const reviewerAuthorized = policy.configured && policy.allowedSubjects.has(reviewer.subject);
  if (!reviewerAuthorized) throw new Error('Reviewer is not authorized for Evidence review.');

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      evidenceId: evidence.id,
      evidenceClaimId: evidence.claimId,
      evidenceClass: evidence.evidenceClass,
      evidenceSourceType: evidence.sourceType,
      evidenceOriginRole: evidence.originRole,
      evidencePolarity: evidence.polarity,
      evidenceReviewStatus: evidence.reviewStatus,
      evidenceVisibility: evidence.visibility,
      evidenceUpdatedAt: evidence.updatedAt,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...REVIEW_BATCH_IDS]),
        isNull(sourceCandidates.duplicateGroupId),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const matches: (typeof rows)[number][] = [];
  for (const row of rows) {
    if ((await sha256(row.candidateId)) === EXPECTED_CANDIDATE_HASH) matches.push(row);
  }
  if (matches.length !== 1) throw new Error('Exact reviewed promoted Candidate/Evidence pair is missing or ambiguous.');
  const selected = matches[0];
  if (!selected) throw new Error('Exact reviewed promoted Candidate was not selected.');

  if (
    selected.candidateStatus !== 'promoted' ||
    selected.duplicateGroupId !== null ||
    selected.evidenceClass !== 'a' ||
    selected.evidenceSourceType !== 'official_page' ||
    selected.evidenceOriginRole !== 'merchant_side' ||
    selected.evidencePolarity !== 'supporting' ||
    selected.evidenceReviewStatus !== 'pending' ||
    selected.evidenceVisibility !== 'private' ||
    selected.evidenceUpdatedAt.toISOString() !== EXPECTED_EVIDENCE_UPDATED_AT
  ) {
    throw new Error('Exact reviewed Candidate/Evidence state changed before confirmation.');
  }

  const [promotion] = await db
    .select({ claimId: candidatePromotionDecisions.claimId })
    .from(candidatePromotionDecisions)
    .where(eq(candidatePromotionDecisions.candidateId, selected.candidateId))
    .limit(1);
  if (!promotion) throw new Error('Reviewed promoted Candidate is missing its promotion decision.');

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
  if (!claim) throw new Error('Reviewed promoted Claim is missing.');
  if (claim.claimStatus !== 'candidate' || claim.visibility !== 'hidden') {
    throw new Error('Reviewed Claim is not a hidden candidate Claim before confirmation.');
  }

  let evidenceUpdatedAt = selected.evidenceUpdatedAt;
  let evidenceBound = selected.evidenceClaimId === claim.id;
  if (selected.evidenceClaimId === null) {
    const bindAt = new Date(
      Math.max(Date.now(), claim.updatedAt.getTime() + 1_000, selected.evidenceUpdatedAt.getTime() + 1_000),
    );
    const [bound] = await db
      .update(evidence)
      .set({ claimId: claim.id, updatedAt: bindAt })
      .where(
        and(
          eq(evidence.id, selected.evidenceId),
          eq(evidence.reviewStatus, 'pending'),
          isNull(evidence.claimId),
          eq(evidence.updatedAt, selected.evidenceUpdatedAt),
        ),
      )
      .returning({ claimId: evidence.claimId, updatedAt: evidence.updatedAt });
    if (!bound || bound.claimId !== claim.id) throw new Error('Failed to bind reviewed Evidence to Claim.');
    evidenceUpdatedAt = bound.updatedAt;
    evidenceBound = true;
  } else if (selected.evidenceClaimId !== claim.id) {
    throw new Error('Reviewed Evidence is already bound to a different Claim.');
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
  if (assetRows.length !== 1) throw new Error('Reviewed Claim must have exactly one payment combination.');

  const decidedAt = new Date(Math.max(claim.updatedAt.getTime(), evidenceUpdatedAt.getTime()) + 1_000);
  const nextReviewAt = new Date(decidedAt.getTime() + 30 * 24 * 60 * 60 * 1_000);
  const requestId = await deterministicUuid(`europe-west-reviewed:evidence-review:${selected.candidateId}`);
  const context = authorizeEvidenceReview(reviewer, policy, requestId);
  const receipt = await createEvidenceReviewDecisionService(
    createDrizzleEvidenceReviewBackend(db),
  ).decide(context, {
    evidenceId: selected.evidenceId,
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
    internalNote: 'Exact bounded Europe-west Claim confirmed from reviewed official merchant Lightning payment Evidence.',
    nextReviewAt: nextReviewAt.toISOString(),
    endedReason: null,
  });

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      exactReviewedCandidates: 1,
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
    }),
  );
}

await main();
