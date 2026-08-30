import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
] as const;
const EXPECTED_PENDING_COUNT = 4;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing OSM freshness audit outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({
      candidateId: sourceCandidates.id,
      evidenceId: evidence.id,
    })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...BATCH_IDS]),
        isNull(sourceCandidates.duplicateGroupId),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const unique = new Map(rows.map((row) => [row.evidenceId, row]));
  const pending = [...unique.values()];
  if (pending.length !== EXPECTED_PENDING_COUNT) {
    throw new Error(`Pending Evidence set changed: expected ${EXPECTED_PENDING_COUNT}, found ${pending.length}.`);
  }

  const details: Array<Record<string, unknown>> = [];
  for (const row of pending) {
    const relations = await db
      .select({ relationship: candidateSourceRecords.relationship, rawPayload: sourceRecords.rawPayload })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));
    const origin = relations.find((relation) => relation.relationship === 'origin');
    const payload = record(origin?.rawPayload);
    const element = record(payload?.element);
    const tags = stringMap(element?.tags);
    const reviewSeed = record(payload?.reviewSeed);
    const paymentTags = stringMap(reviewSeed?.paymentTags);
    const datedKeys = [
      'check_date',
      'check_date:payment',
      'payment:check_date',
      'survey:date',
      'survey_date',
    ];
    const paymentCheckDates = Object.fromEntries(
      datedKeys.flatMap((key) => (typeof tags[key] === 'string' && tags[key].trim() ? [[key, tags[key]]] : [])),
    );
    const elementTimestamp =
      typeof element?.timestamp === 'string' && element.timestamp.trim() ? element.timestamp : null;

    details.push({
      candidateHash: await sha256(row.candidateId),
      paymentTags,
      paymentCheckDates,
      elementTimestamp,
    });
  }

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      pendingCandidateCount: pending.length,
      candidatesWithExplicitPaymentCheckDate: details.filter(
        (row) => Object.keys((row.paymentCheckDates ?? {}) as Record<string, string>).length > 0,
      ).length,
      candidatesWithElementTimestamp: details.filter((row) => row.elementTimestamp !== null).length,
      mutationPerformed: false,
      publicDataChanged: false,
      candidatePayloadExposedInLogs: false,
      details,
    }),
  );
}

await main();
