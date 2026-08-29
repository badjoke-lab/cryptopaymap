import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: {
  env: Record<string, string | undefined>;
};

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const SOURCE_NAME = 'Official merchant websites — review discovery';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 1_000_000;
const CONCURRENCY = 4;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function websiteUrl(rawPayload: unknown): string | null {
  const seed = asRecord(asRecord(rawPayload)?.reviewSeed);
  const value = seed?.websiteUrl;
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasExplicitPaymentEvidence(text: string): boolean {
  const cryptoTerm = '(?:bitcoin|btc|lightning|sats?|cryptocurrency|crypto)';
  const paymentTerm = '(?:pay(?:ment|ing)?|accept(?:ed|s|ing)?|checkout|決済|支払|支払い|ビットコイン|ライトニング)';
  return (
    new RegExp(`${cryptoTerm}.{0,100}${paymentTerm}|${paymentTerm}.{0,100}${cryptoTerm}`, 'i').test(
      text,
    ) ||
    /ビットコイン.{0,100}(?:決済|支払|支払い)|(?:決済|支払|支払い).{0,100}ビットコイン/i.test(
      text,
    )
  );
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchOfficialPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'CryptoPayMap-review-evidence-discovery/1.0' },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    const normalized = normalizeHtml(body);
    if (!hasExplicitPaymentEvidence(normalized)) return null;
    return {
      resolvedUrl: response.url || url,
      fetchedAt: new Date(),
      contentHash: await sha256(normalized),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing to persist Evidence outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const candidateRows = await db
    .select({
      candidateId: sourceCandidates.id,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.importBatchId, TOKYO_BATCH_ID),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const targets = candidateRows
    .filter((row) => row.duplicateGroupId === null && row.officialDomain !== null)
    .map((row) => ({
      candidateId: row.candidateId,
      officialDomain: row.officialDomain as string,
      url: websiteUrl(row.rawPayload),
    }))
    .filter((row): row is { candidateId: string; officialDomain: string; url: string } =>
      row.url !== null,
    );

  const existingSource = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.sourceType, 'official_site'), eq(sources.name, SOURCE_NAME)))
    .limit(1);
  const sourceId =
    existingSource[0]?.id ??
    (
      await db
        .insert(sources)
        .values({
          sourceType: 'official_site',
          name: SOURCE_NAME,
          attributionText: 'Official merchant website',
          isActive: true,
        })
        .returning({ id: sources.id })
    )[0]?.id;
  if (!sourceId) throw new Error('Failed to resolve official-site source.');

  const counters = {
    probed: targets.length,
    explicitDiscovered: 0,
    sourceRecordsCreated: 0,
    supportingLinksCreated: 0,
    pendingEvidenceCreated: 0,
    alreadyPersisted: 0,
    automaticConfirmedCount: 0,
  };

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const target = targets[index];
      if (!target) continue;
      const fetched = await fetchOfficialPage(target.url);
      if (!fetched) continue;
      counters.explicitDiscovered += 1;

      const externalId = `candidate:${target.candidateId}:official-payment-page`;
      const existingRecord = await db
        .select({ id: sourceRecords.id })
        .from(sourceRecords)
        .where(and(eq(sourceRecords.sourceId, sourceId), eq(sourceRecords.externalId, externalId)))
        .limit(1);

      let sourceRecordId = existingRecord[0]?.id;
      if (!sourceRecordId) {
        sourceRecordId = (
          await db
            .insert(sourceRecords)
            .values({
              sourceId,
              externalId,
              sourceUrl: fetched.resolvedUrl,
              rawPayload: {
                discovery: 'official_payment_language',
                discoveryVersion: 'tokyo-official-evidence-v1',
              },
              officialDomain: target.officialDomain,
              observedAt: fetched.fetchedAt,
              fetchedAt: fetched.fetchedAt,
              contentHash: fetched.contentHash,
            })
            .returning({ id: sourceRecords.id })
        )[0]?.id;
        if (!sourceRecordId) throw new Error('Failed to create official source record.');
        counters.sourceRecordsCreated += 1;
      }

      const existingLink = await db
        .select({ candidateId: candidateSourceRecords.candidateId })
        .from(candidateSourceRecords)
        .where(
          and(
            eq(candidateSourceRecords.candidateId, target.candidateId),
            eq(candidateSourceRecords.sourceRecordId, sourceRecordId),
          ),
        )
        .limit(1);
      if (existingLink.length === 0) {
        await db.insert(candidateSourceRecords).values({
          candidateId: target.candidateId,
          sourceRecordId,
          relationship: 'supporting',
        });
        counters.supportingLinksCreated += 1;
      }

      const existingEvidence = await db
        .select({ id: evidence.id })
        .from(evidence)
        .where(
          and(
            eq(evidence.sourceRecordId, sourceRecordId),
            eq(evidence.evidenceKind, 'official_payment_page'),
          ),
        )
        .limit(1);
      if (existingEvidence.length > 0) {
        counters.alreadyPersisted += 1;
        continue;
      }

      await db.insert(evidence).values({
        sourceRecordId,
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        originRole: 'merchant_side',
        polarity: 'supporting',
        sourceName: 'Official merchant website',
        sourceUrl: fetched.resolvedUrl,
        observedAt: fetched.fetchedAt,
        fetchedAt: fetched.fetchedAt,
        summary: 'Official merchant page contains explicit cryptocurrency payment language.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: fetched.contentHash,
      });
      counters.pendingEvidenceCreated += 1;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      ...counters,
      evidenceVisibility: 'private',
      evidenceReviewStatus: 'pending',
      candidateStateChanged: false,
    }),
  );
}

await main();
