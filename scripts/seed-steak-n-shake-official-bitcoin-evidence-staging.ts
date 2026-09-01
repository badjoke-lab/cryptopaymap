import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import {
  candidateSourceRecords,
  evidence,
  sourceCandidates,
  sourceRecords,
  sources,
} from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const SOURCE_NAME = 'Steak n Shake official Bitcoin terms';
const OFFICIAL_DOMAIN = 'steaknshake.com';
const OFFICIAL_URL = 'https://www.steaknshake.com/terms-of-use/';
const MAX_TARGETS = 500;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 750_000;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringMap(value: unknown): Record<string, string> {
  const source = record(value);
  if (!source) return {};
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function normalizedName(rawPayload: unknown): string {
  const seed = record(record(rawPayload)?.reviewSeed);
  const name = typeof seed?.name === 'string' ? seed.name : '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bitcoinTagged(rawPayload: unknown): boolean {
  const seed = record(record(rawPayload)?.reviewSeed);
  const paymentTags = stringMap(seed?.paymentTags);
  return ['yes', 'only'].includes((paymentTags['payment:bitcoin'] ?? '').toLowerCase());
}

function isSteakNShake(rawPayload: unknown): boolean {
  const name = normalizedName(rawPayload);
  return name === 'steak n shake' || name === 'steak and shake' || name.startsWith('steak n shake ');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedPageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function fetchCurrentOfficialTerms() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(OFFICIAL_URL, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'CryptoPayMap-chain-scope-evidence/1.0',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
      },
    });
    if (!response.ok) throw new Error(`Official terms returned HTTP ${response.status}.`);
    const resolved = new URL(response.url);
    const host = resolved.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== OFFICIAL_DOMAIN) throw new Error('Official terms redirected outside merchant domain.');
    const html = (await response.text()).slice(0, MAX_BODY_CHARS);
    const text = normalizedPageText(html);
    const hasBitcoinSection = /bitcoin payments/.test(text);
    const hasInStoreScope = /certain in-store or drive-through orders/.test(text);
    const hasWalletFlow = /scan a qr code/.test(text) && /payment transaction in btc/.test(text);
    if (!hasBitcoinSection || !hasInStoreScope || !hasWalletFlow) {
      throw new Error('Current official terms no longer contain the required Bitcoin payment language.');
    }
    const fetchedAt = new Date();
    return {
      fetchedAt,
      resolvedUrl: resolved.toString(),
      contentHash: await sha256(text),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing chain-scoped Evidence seeding outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);
  const official = await fetchCurrentOfficialTerms();

  const originRows = await db
    .select({
      candidateId: sourceCandidates.id,
      candidateStatus: sourceCandidates.candidateStatus,
      duplicateGroupId: sourceCandidates.duplicateGroupId,
      officialDomain: sourceRecords.officialDomain,
      rawPayload: sourceRecords.rawPayload,
    })
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.candidateId, sourceCandidates.id))
    .innerJoin(sourceRecords, eq(sourceRecords.id, candidateSourceRecords.sourceRecordId))
    .where(
      and(
        eq(sourceCandidates.candidateType, 'physical_place'),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    )
    .orderBy(asc(sourceCandidates.id));

  const targets = originRows
    .filter(
      (row) =>
        row.duplicateGroupId === null &&
        row.officialDomain?.toLowerCase().replace(/^www\./, '') === OFFICIAL_DOMAIN &&
        isSteakNShake(row.rawPayload) &&
        bitcoinTagged(row.rawPayload),
    )
    .slice(0, MAX_TARGETS);

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
          attributionText: 'Steak n Shake official Terms of Use',
          isActive: true,
        })
        .returning({ id: sources.id })
    )[0]?.id;
  if (!sourceId) throw new Error('Failed to resolve Steak n Shake official source.');

  let sourceRecordsCreated = 0;
  let supportingLinksCreated = 0;
  let pendingEvidenceCreated = 0;
  let alreadyPersisted = 0;

  for (const target of targets) {
    const externalId = `candidate:${target.candidateId}:steak-n-shake-bitcoin-terms:v1`;
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
            sourceUrl: official.resolvedUrl,
            rawPayload: {
              discovery: 'merchant_chain_scope_official_terms',
              discoveryVersion: 'steak-n-shake-bitcoin-terms-v1',
              candidateId: target.candidateId,
              locationSpecificity: 'osm_payment_tag_plus_chain_official_terms',
            },
            officialDomain: OFFICIAL_DOMAIN,
            observedAt: official.fetchedAt,
            fetchedAt: official.fetchedAt,
            contentHash: official.contentHash,
          })
          .returning({ id: sourceRecords.id })
      )[0]?.id;
      if (!sourceRecordId) throw new Error('Failed to persist chain-scoped source record.');
      sourceRecordsCreated += 1;
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
      supportingLinksCreated += 1;
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
      alreadyPersisted += 1;
      continue;
    }

    await db.insert(evidence).values({
      sourceRecordId,
      evidenceKind: 'official_payment_page',
      evidenceClass: 'a',
      sourceType: 'official_page',
      originRole: 'merchant_side',
      polarity: 'supporting',
      sourceName: 'Steak n Shake official Terms of Use',
      sourceUrl: official.resolvedUrl,
      observedAt: official.fetchedAt,
      fetchedAt: official.fetchedAt,
      summary:
        'Official Steak n Shake terms currently document BTC payment for certain in-store or drive-through orders; this Candidate is location-scoped by its OSM payment:bitcoin tag.',
      visibility: 'private',
      reviewStatus: 'pending',
      contentHash: official.contentHash,
    });
    pendingEvidenceCreated += 1;
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      merchant: 'Steak n Shake',
      officialUrl: official.resolvedUrl,
      candidatesScanned: originRows.length,
      matchedLocationScopedCandidates: targets.length,
      sourceRecordsCreated,
      supportingLinksCreated,
      pendingEvidenceCreated,
      alreadyPersisted,
      automaticConfirmedCount: 0,
      evidenceVisibility: 'private',
      evidenceReviewStatus: 'pending',
      candidatePayloadExposed: false,
    }),
  );
}

await main();
