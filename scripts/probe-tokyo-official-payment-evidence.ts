import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: {
  env: Record<string, string | undefined>;
};

const EXPECTED_TARGET = 'fixed-review-staging';
const TOKYO_BATCH_ID = '9a7aa03b-ebce-4ee0-ad44-731149450d85';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 1_000_000;
const CONCURRENCY = 5;

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
    .toLowerCase();
}

function classifyPaymentEvidence(text: string): 'explicit' | 'crypto_term' | 'none' {
  const crypto = '(?:bitcoin|btc|lightning|sats?|cryptocurrency|crypto)';
  const payment = '(?:pay(?:ment|ing)?|accept(?:ed|s|ing)?|checkout|決済|支払|支払い|ビットコイン|ライトニング)';
  if (
    new RegExp(`${crypto}.{0,100}${payment}|${payment}.{0,100}${crypto}`, 'i').test(text) ||
    /ビットコイン.{0,100}(?:決済|支払|支払い)|(?:決済|支払|支払い).{0,100}ビットコイン/i.test(text)
  ) {
    return 'explicit';
  }
  if (new RegExp(crypto, 'i').test(text) || /ビットコイン|ライトニング/i.test(text)) {
    return 'crypto_term';
  }
  return 'none';
}

async function probe(url: string): Promise<'explicit' | 'crypto_term' | 'none' | 'unreachable'> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'CryptoPayMap-review-evidence-probe/1.0' },
    });
    if (!response.ok) return 'unreachable';
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return 'none';
    const body = (await response.text()).slice(0, MAX_BODY_CHARS);
    return classifyPaymentEvidence(normalizeHtml(body));
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing to probe outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const db = createDatabase(databaseUrl);
  const rows = await db
    .select({
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

  const targets = rows
    .map((row) => ({
      url: websiteUrl(row.rawPayload),
      duplicateRisk: row.duplicateGroupId !== null,
      hasOfficialDomain: row.officialDomain !== null,
    }))
    .filter((row): row is { url: string; duplicateRisk: boolean; hasOfficialDomain: boolean } =>
      row.url !== null && row.hasOfficialDomain,
    );

  const counts = {
    targets: targets.length,
    explicitOfficialPaymentEvidence: 0,
    cryptoTermOnly: 0,
    noPaymentEvidenceOnLandingPage: 0,
    unreachable: 0,
    explicitWithoutDuplicateSignal: 0,
    explicitWithDuplicateSignal: 0,
  };

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const target = targets[index];
      if (!target) continue;
      const result = await probe(target.url);
      if (result === 'explicit') {
        counts.explicitOfficialPaymentEvidence += 1;
        if (target.duplicateRisk) counts.explicitWithDuplicateSignal += 1;
        else counts.explicitWithoutDuplicateSignal += 1;
      } else if (result === 'crypto_term') {
        counts.cryptoTermOnly += 1;
      } else if (result === 'none') {
        counts.noPaymentEvidenceOnLandingPage += 1;
      } else {
        counts.unreachable += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchId: TOKYO_BATCH_ID,
      ...counts,
      automaticConfirmedCount: 0,
      interpretation: 'discovery_only_requires_review_before_evidence_persistence_or_promotion',
    }),
  );
}

await main();
