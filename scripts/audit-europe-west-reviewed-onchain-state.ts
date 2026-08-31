import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const EXPECTED_CANDIDATE_HASH = '61af688c243438b352a6db8a31034a56b97b4abb83efbbbc59d0b3a7fe6df2e7';
const EXPECTED_CANDIDATE_UPDATED_AT = '2026-08-30T03:12:30.602Z';
const EXPECTED_EVIDENCE_UPDATED_AT = '2026-08-30T03:15:21.538Z';
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

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing reviewed on-chain audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateType: sourceCandidates.candidateType,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      canonicalEntityId: sourceCandidates.canonicalEntityId,
      canonicalLocationId: sourceCandidates.canonicalLocationId,
      candidateUpdatedAt: sourceCandidates.updatedAt,
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
        eq(evidence.evidenceKind, 'official_payment_page'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const matches: (typeof rows)[number][] = [];
  for (const row of rows) if ((await sha256(row.candidateId)) === EXPECTED_CANDIDATE_HASH) matches.push(row);
  const selected = matches.length === 1 ? matches[0] : null;

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      exactMatches: matches.length,
      candidateTypePhysical: selected?.candidateType === 'physical_place',
      candidateStatusReviewable: selected ? ['new', 'triaged'].includes(selected.candidateStatus) : false,
      candidateStatusPromoted: selected?.candidateStatus === 'promoted',
      duplicateClear: selected?.duplicateGroupId === null,
      canonicalEntityAbsent: selected?.canonicalEntityId === null,
      canonicalLocationAbsent: selected?.canonicalLocationId === null,
      candidateTimestampMatchesReviewedVersion:
        selected?.candidateUpdatedAt.toISOString() === EXPECTED_CANDIDATE_UPDATED_AT,
      evidenceClassA: selected?.evidenceClass === 'a',
      evidenceSourceOfficialPage: selected?.evidenceSourceType === 'official_page',
      evidenceMerchantSide: selected?.evidenceOriginRole === 'merchant_side',
      evidenceSupporting: selected?.evidencePolarity === 'supporting',
      evidencePending: selected?.evidenceReviewStatus === 'pending',
      evidencePrivate: selected?.evidenceVisibility === 'private',
      evidenceTimestampMatchesReviewedVersion:
        selected?.evidenceUpdatedAt.toISOString() === EXPECTED_EVIDENCE_UPDATED_AT,
      mutationPerformed: false,
      payloadExposed: false,
    }),
  );
}

await main();
