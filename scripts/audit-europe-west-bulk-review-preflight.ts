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
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_CHARS = 750_000;
const MAX_REVIEW_ROWS = 30;
const BATCH_IDS = [
  'd0e17010-611c-48b2-a75d-8b389c1bee60',
  '5c85e86a-bc05-4f9d-a1f3-9d5e6135ef81',
  '8d9d6627-48f6-43e7-b7f0-7a90e1ed4689',
  '8e2c7c6a-e300-4747-90f7-290327870426',
  '3808ea78-195f-4558-8088-37c172be6b63',
  'eaf3d4d7-76e8-435e-bc9a-d2cb2988552c',
  '5d664655-8225-414e-b9ba-4c525993d944',
  '99216a90-069f-47d0-804f-dca1116f89dd',
  '312d3526-3438-47c5-8351-5c2fc242d3c6',
  '20983068-031d-492b-ac0c-b9a0d93a5e70',
  '7d43f605-5f3e-4a79-a6a9-a222775821be',
  '500467c1-075d-4f01-b2ef-15f141f30c82',
  'cb7bdcb7-e39d-46cb-90fe-0c3c05d45f8e',
  'd079f027-9ea4-4a9a-9e52-a7753d917986',
  'aa493ab1-c32b-4b0f-9df7-944f61f90e4c',
  '61483919-bbf7-4290-80c5-7c51ac8b5445',
  '234599d9-be62-4139-8f30-2d11700dce80',
  '431eb7d9-eb7e-4202-aadd-84b5f7e4a3f1',
  'c5c63726-d420-42ac-adb4-a88962580936',
  '9151fb61-886c-4bed-b122-e35eebaa8f92',
  '363bdf08-e6b6-48c1-9d5d-38a0f772eb9d',
  '5a9cc8b9-0926-4f43-b186-bead18af7e31',
  '7c4bc14b-60ac-4925-869f-d45624b19eab',
] as const;

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

function normalizeHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function safeEvidenceUrl(rawUrl: string, officialDomain: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = normalizeHost(url.hostname);
    const domain = normalizeHost(officialDomain);
    if (!domain || (host !== domain && !host.endsWith(`.${domain}`) && !domain.endsWith(`.${host}`))) {
      return null;
    }
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '::1'
    ) {
      return null;
    }
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchText(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'CryptoPayMap-bounded-review-preflight/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
    return normalizeHtml((await response.text()).slice(0, MAX_BODY_CHARS));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function strictPattern(text: string, network: 'lightning' | 'bitcoin'): string | null {
  const crypto = network === 'lightning' ? '(?:lightning|lightning network)' : '(?:bitcoin|btc)';
  const verbs = '(?:accept(?:ed|s|ing)?|pay(?:ment|ments|ing)?|checkout|purchase|buy|決済|支払|支払い)';
  const direct = new RegExp(`${verbs}.{0,80}${crypto}|${crypto}.{0,80}${verbs}`, 'i');
  if (!direct.test(text)) return null;
  if (network === 'lightning' && /(?:pay|payment|accept|checkout).{0,80}lightning|lightning.{0,80}(?:pay|payment|accept|checkout)/i.test(text)) {
    return 'explicit_lightning_payment';
  }
  if (network === 'bitcoin' && /(?:pay|payment|accept|checkout).{0,80}(?:bitcoin|btc)|(?:bitcoin|btc).{0,80}(?:pay|payment|accept|checkout)/i.test(text)) {
    return 'explicit_bitcoin_payment';
  }
  return 'explicit_crypto_payment';
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing Europe-west bulk review preflight outside fixed-review staging.');
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
      evidenceId: evidence.id,
      evidenceUpdatedAt: evidence.updatedAt,
      evidenceSourceRecordId: evidence.sourceRecordId,
      evidenceUrl: evidence.sourceUrl,
      officialDomain: sourceRecords.officialDomain,
    })
    .from(evidence)
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .where(
      and(
        inArray(sourceCandidates.importBatchId, [...BATCH_IDS]),
        eq(sourceCandidates.candidateType, 'physical_place'),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        isNull(sourceCandidates.duplicateGroupId),
        isNull(sourceCandidates.canonicalEntityId),
        isNull(sourceCandidates.canonicalLocationId),
        eq(evidence.evidenceKind, 'official_payment_page'),
        eq(evidence.evidenceClass, 'a'),
        eq(evidence.sourceType, 'official_page'),
        eq(evidence.originRole, 'merchant_side'),
        eq(evidence.polarity, 'supporting'),
        eq(evidence.reviewStatus, 'pending'),
        eq(evidence.visibility, 'private'),
      ),
    )
    .orderBy(asc(sourceCandidates.id), asc(evidence.id));

  const unique = new Map(rows.map((row) => [`${row.candidateId}:${row.evidenceId}`, row]));
  const pending = [...unique.values()];
  const reviewRows: Array<Record<string, unknown>> = [];
  let currentPageFetchable = 0;
  let originPaymentTagged = 0;
  let countryProofPresent = 0;
  let strictOfficialPayment = 0;

  for (const row of pending) {
    const relations = await db
      .select({
        relationship: candidateSourceRecords.relationship,
        rawPayload: sourceRecords.rawPayload,
      })
      .from(candidateSourceRecords)
      .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
      .where(eq(candidateSourceRecords.candidateId, row.candidateId));

    const origin = relations.find((relation) => relation.relationship === 'origin');
    const originPayload = record(origin?.rawPayload);
    const seed = record(originPayload?.reviewSeed);
    const paymentTags = stringMap(seed?.paymentTags);
    const lightningTagged = ['yes', 'only'].includes((paymentTags['payment:lightning'] ?? '').toLowerCase());
    const bitcoinTagged = ['yes', 'only'].includes((paymentTags['payment:bitcoin'] ?? '').toLowerCase());
    const network: 'lightning' | 'bitcoin' | null = lightningTagged
      ? 'lightning'
      : bitcoinTagged
        ? 'bitcoin'
        : null;
    if (network) originPaymentTagged += 1;

    const countryCodes = new Set(
      relations.flatMap((relation) => {
        const payload = record(relation.rawPayload);
        const value = payload?.sourceSystem === 'openstreetmap_nominatim' ? payload?.countryCode : null;
        return typeof value === 'string' && /^[A-Z]{2}$/.test(value) ? [value] : [];
      }),
    );
    const countryCode = countryCodes.size === 1 ? [...countryCodes][0] : null;
    if (countryCode) countryProofPresent += 1;

    const url =
      typeof row.evidenceUrl === 'string' && typeof row.officialDomain === 'string'
        ? safeEvidenceUrl(row.evidenceUrl, row.officialDomain)
        : null;
    const text = url ? await fetchText(url) : null;
    if (text) currentPageFetchable += 1;
    const pattern = text && network ? strictPattern(text, network) : null;
    if (pattern) strictOfficialPayment += 1;

    const seedName = typeof seed?.name === 'string' && seed.name.trim().length > 0;
    const seedLatitude = typeof seed?.latitude === 'number' && Number.isFinite(seed.latitude);
    const seedLongitude = typeof seed?.longitude === 'number' && Number.isFinite(seed.longitude);
    const preflightReady = Boolean(
      network &&
        countryCode &&
        pattern &&
        seedName &&
        seedLatitude &&
        seedLongitude,
    );

    if (preflightReady && reviewRows.length < MAX_REVIEW_ROWS) {
      reviewRows.push({
        candidateHash: await sha256(row.candidateId),
        evidenceHash: await sha256(row.evidenceId),
        candidateUpdatedAt: row.candidateUpdatedAt.toISOString(),
        evidenceUpdatedAt: row.evidenceUpdatedAt.toISOString(),
        countryCode,
        network,
        strictPattern: pattern,
        duplicateClear: true,
        canonicalClear: true,
        currentOfficialPageFetchable: true,
        originPaymentTagged: true,
        countryProofPresent: true,
      });
    }
  }

  process.stdout.write(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchesAudited: BATCH_IDS.length,
      pendingAEvidencePairs: pending.length,
      currentPageFetchable,
      originPaymentTagged,
      countryProofPresent,
      strictOfficialPayment,
      preflightReady: reviewRows.length,
      reviewRows,
      mutationPerformed: false,
      publicDataChanged: false,
      payloadExposed: false,
    }),
  );
}

await main();
