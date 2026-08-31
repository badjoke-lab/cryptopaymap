import { and, eq, inArray } from 'drizzle-orm';
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
const SOURCE_NAME = 'Official merchant websites — bounded payment crawl';
const FETCH_TIMEOUT_MS = 6_000;
const MAX_BODY_CHARS = 750_000;
const MAX_INTERNAL_PAGES = 5;
const MAX_REDIRECTS = 3;
const CONCURRENCY = 4;
const MAX_BATCH_IDS = 250;
const MAX_CANDIDATE_IDS = 250;
const DEFAULT_MAX_TARGETS = 200;
const HARD_MAX_TARGETS = 250;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function websiteUrl(rawPayload: unknown): string | null {
  const seed = asRecord(asRecord(rawPayload)?.reviewSeed);
  const value = seed?.websiteUrl;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function batchIdsFromEnvironment(): string[] {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_BATCH_IDS?.trim() ?? '';
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) throw new Error('CPM_OFFICIAL_EVIDENCE_BATCH_IDS is required.');
  if (ids.length > MAX_BATCH_IDS) {
    throw new Error(`At most ${MAX_BATCH_IDS} import batch IDs may be crawled per run.`);
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Every official Evidence import batch ID must be a UUID.');
  }
  return ids;
}

function candidateIdsFromEnvironment(): string[] | null {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_CANDIDATE_IDS?.trim() ?? '';
  if (!raw) return null;
  const ids = [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0 || ids.length > MAX_CANDIDATE_IDS) {
    throw new Error(
      `CPM_OFFICIAL_EVIDENCE_CANDIDATE_IDS must contain 1-${MAX_CANDIDATE_IDS} UUIDs.`,
    );
  }
  if (ids.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error('Every official Evidence Candidate ID must be a UUID.');
  }
  return ids;
}

function maxTargetsFromEnvironment(): number {
  const raw = process.env.CPM_OFFICIAL_EVIDENCE_MAX_TARGETS?.trim();
  const value = raw ? Number(raw) : DEFAULT_MAX_TARGETS;
  if (!Number.isInteger(value) || value < 1 || value > HARD_MAX_TARGETS) {
    throw new Error(`CPM_OFFICIAL_EVIDENCE_MAX_TARGETS must be 1-${HARD_MAX_TARGETS}.`);
  }
  return value;
}

function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a = 0, b = 0] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function unsafeHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:') ||
    privateIpv4(host)
  );
}

function safeOfficialUrl(rawUrl: string, officialDomain: string): URL | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    if (unsafeHostname(url.hostname)) return null;
    const host = normalizeHost(url.hostname);
    const domain = normalizeHost(officialDomain);
    if (
      !domain ||
      (host !== domain && !host.endsWith(`.${domain}`) && !domain.endsWith(`.${host}`))
    ) {
      return null;
    }
    url.hash = '';
    return url;
  } catch {
    return null;
  }
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

function hasExplicitPaymentEvidence(text: string): boolean {
  const cryptoTerm =
    '(?:bitcoin|btc|lightning|sats?|cryptocurrency|crypto|ビットコイン|ライトニング)';
  const paymentTerm = '(?:pay(?:ment|ing)?|accept(?:ed|s|ing)?|checkout|決済|支払|支払い)';
  return new RegExp(
    `${cryptoTerm}.{0,120}${paymentTerm}|${paymentTerm}.{0,120}${cryptoTerm}`,
    'i',
  ).test(text);
}

function htmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function likelyPaymentLinks(html: string, baseUrl: URL, officialDomain: string): URL[] {
  const links: { url: URL; score: number }[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = htmlEntities(match[1] ?? '').trim();
    if (!href || href.startsWith('#') || /^(?:mailto:|tel:|javascript:)/i.test(href)) continue;
    let absolute: URL;
    try {
      absolute = new URL(href, baseUrl);
    } catch {
      continue;
    }
    const safe = safeOfficialUrl(absolute.toString(), officialDomain);
    if (!safe) continue;
    safe.search = '';
    safe.hash = '';
    const key = safe.toString();
    if (seen.has(key) || key === baseUrl.toString()) continue;
    const anchor = normalizeHtml(match[2] ?? '');
    const haystack = `${safe.pathname.toLowerCase()} ${anchor}`;
    let score = 0;
    if (/(?:bitcoin|lightning|crypto|btc|sats?|ビットコイン|ライトニング)/i.test(haystack)) {
      score += 4;
    }
    if (/(?:payment|payments|pay|checkout|決済|支払|支払い)/i.test(haystack)) score += 3;
    if (/(?:faq|help|support|guide|how-to|howto|利用|案内)/i.test(haystack)) score += 1;
    if (score === 0) continue;
    seen.add(key);
    links.push({ url: safe, score });
  }
  return links
    .sort(
      (left, right) =>
        right.score - left.score || left.url.toString().localeCompare(right.url.toString()),
    )
    .slice(0, MAX_INTERNAL_PAGES)
    .map((entry) => entry.url);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchOfficialPage(start: URL, officialDomain: string) {
  let current = start;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'CryptoPayMap-official-payment-review-crawl/1.0',
          accept: 'text/html,text/plain;q=0.9,*/*;q=0.1',
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirect === MAX_REDIRECTS) return null;
        const next = safeOfficialUrl(new URL(location, current).toString(), officialDomain);
        if (!next) return null;
        current = next;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('text/plain')) return null;
      const html = (await response.text()).slice(0, MAX_BODY_CHARS);
      const normalized = normalizeHtml(html);
      return {
        resolvedUrl: current,
        html,
        normalized,
        fetchedAt: new Date(),
        contentHash: await sha256(normalized),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) {
    throw new Error('Refusing official Evidence crawl outside fixed-review staging.');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const batchIds = batchIdsFromEnvironment();
  const candidateIds = candidateIdsFromEnvironment();
  const maxTargets = maxTargetsFromEnvironment();
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
        inArray(sourceCandidates.importBatchId, batchIds),
        inArray(sourceCandidates.candidateStatus, ['new', 'triaged']),
        eq(candidateSourceRecords.relationship, 'origin'),
      ),
    );

  const candidateIdSet = candidateIds === null ? null : new Set(candidateIds);
  const eligibleTargets = candidateRows
    .filter(
      (row) =>
        (candidateIdSet === null || candidateIdSet.has(row.candidateId)) &&
        row.duplicateGroupId === null &&
        row.officialDomain !== null,
    )
    .map((row) => {
      const rawUrl = websiteUrl(row.rawPayload);
      const url = rawUrl ? safeOfficialUrl(rawUrl, row.officialDomain as string) : null;
      return {
        candidateId: row.candidateId,
        officialDomain: row.officialDomain as string,
        url,
      };
    })
    .filter(
      (row): row is { candidateId: string; officialDomain: string; url: URL } => row.url !== null,
    )
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const targets = eligibleTargets.slice(0, maxTargets);
  const completedCrawlCandidateIds = new Set<string>();

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
  if (!sourceId) throw new Error('Failed to resolve bounded official-site crawl source.');
  const resolvedSourceId: string = sourceId;

  const counters = {
    eligibleTargetsBeforeLimit: eligibleTargets.length,
    targets: targets.length,
    landingPagesFetched: 0,
    internalLinksConsidered: 0,
    internalPagesFetched: 0,
    explicitDiscovered: 0,
    sourceRecordsCreated: 0,
    supportingLinksCreated: 0,
    pendingEvidenceCreated: 0,
    alreadyPersisted: 0,
    automaticConfirmedCount: 0,
    attemptMarkersPersisted: 0,
    failureMarkersPersisted: 0,
  };

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor++;
      const target = targets[index];
      if (!target) continue;

      const landing = await fetchOfficialPage(target.url, target.officialDomain);
      if (!landing) continue;
      completedCrawlCandidateIds.add(target.candidateId);
      counters.landingPagesFetched += 1;

      let found = hasExplicitPaymentEvidence(landing.normalized) ? landing : null;
      if (!found) {
        const internalLinks = likelyPaymentLinks(
          landing.html,
          landing.resolvedUrl,
          target.officialDomain,
        );
        counters.internalLinksConsidered += internalLinks.length;
        for (const link of internalLinks) {
          const page = await fetchOfficialPage(link, target.officialDomain);
          if (!page) continue;
          counters.internalPagesFetched += 1;
          if (!hasExplicitPaymentEvidence(page.normalized)) continue;
          found = page;
          break;
        }
      }
      if (!found) continue;
      counters.explicitDiscovered += 1;

      const externalId = `candidate:${target.candidateId}:official-payment-page:crawl-v2`;
      const existingRecord = await db
        .select({ id: sourceRecords.id })
        .from(sourceRecords)
        .where(
          and(
            eq(sourceRecords.sourceId, resolvedSourceId),
            eq(sourceRecords.externalId, externalId),
          ),
        )
        .limit(1);

      let sourceRecordId = existingRecord[0]?.id;
      if (!sourceRecordId) {
        sourceRecordId = (
          await db
            .insert(sourceRecords)
            .values({
              sourceId: resolvedSourceId,
              externalId,
              sourceUrl: found.resolvedUrl.toString(),
              rawPayload: {
                discovery: 'official_payment_language_same_domain_crawl',
                discoveryVersion: 'official-payment-crawl-v2',
              },
              officialDomain: target.officialDomain,
              observedAt: found.fetchedAt,
              fetchedAt: found.fetchedAt,
              contentHash: found.contentHash,
            })
            .returning({ id: sourceRecords.id })
        )[0]?.id;
        if (!sourceRecordId) throw new Error('Failed to persist official crawl source record.');
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
        sourceUrl: found.resolvedUrl.toString(),
        observedAt: found.fetchedAt,
        fetchedAt: found.fetchedAt,
        summary: 'Official merchant page contains explicit cryptocurrency payment language.',
        visibility: 'private',
        reviewStatus: 'pending',
        contentHash: found.contentHash,
      });
      counters.pendingEvidenceCreated += 1;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const attemptFetchedAt = new Date();
  const completedTargets = targets.filter((target) =>
    completedCrawlCandidateIds.has(target.candidateId),
  );
  const attemptExternalIds = completedTargets.map(
    (target) => `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
  );
  if (attemptExternalIds.length > 0) {
    await db
      .insert(sourceRecords)
      .values(
        completedTargets.map((target) => ({
          sourceId: resolvedSourceId,
          externalId: `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
          sourceUrl: target.url.toString(),
          rawPayload: {
            discovery: 'official_payment_crawl_attempt',
            discoveryVersion: 'official-payment-crawl-v2',
            candidateId: target.candidateId,
          },
          officialDomain: target.officialDomain,
          observedAt: attemptFetchedAt,
          fetchedAt: attemptFetchedAt,
        })),
      )
      .onConflictDoNothing();

    const attemptRows = await db
      .select({ id: sourceRecords.id, externalId: sourceRecords.externalId })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.sourceId, resolvedSourceId),
          inArray(sourceRecords.externalId, attemptExternalIds),
        ),
      );
    const candidateIdByAttemptExternalId = new Map(
      completedTargets.map((target) => [
        `candidate:${target.candidateId}:official-payment-crawl-attempt:v2`,
        target.candidateId,
      ]),
    );
    const attemptLinks = attemptRows.flatMap((row) => {
      const candidateId = row.externalId
        ? candidateIdByAttemptExternalId.get(row.externalId)
        : undefined;
      return candidateId
        ? [{ candidateId, sourceRecordId: row.id, relationship: 'supporting' as const }]
        : [];
    });
    if (attemptLinks.length > 0) {
      await db.insert(candidateSourceRecords).values(attemptLinks).onConflictDoNothing();
    }
    counters.attemptMarkersPersisted = attemptLinks.length;
  }

  const failedTargets = targets.filter(
    (target) => !completedCrawlCandidateIds.has(target.candidateId),
  );
  if (failedTargets.length > 0) {
    const retryAfter = new Date(attemptFetchedAt.getTime() + 6 * 60 * 60 * 1_000);
    const failureBucket = attemptFetchedAt.toISOString().slice(0, 13).replace(/[-T:]/g, '');
    const failureExternalIds = failedTargets.map(
      (target) =>
        `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
    );
    await db
      .insert(sourceRecords)
      .values(
        failedTargets.map((target) => ({
          sourceId: resolvedSourceId,
          externalId: `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
          sourceUrl: target.url.toString(),
          rawPayload: {
            discovery: 'official_payment_crawl_failure',
            discoveryVersion: 'official-payment-crawl-failure-v3',
            candidateId: target.candidateId,
            retryAfter: retryAfter.toISOString(),
          },
          officialDomain: target.officialDomain,
          observedAt: attemptFetchedAt,
          fetchedAt: attemptFetchedAt,
        })),
      )
      .onConflictDoNothing();

    const failureRows = await db
      .select({ id: sourceRecords.id, externalId: sourceRecords.externalId })
      .from(sourceRecords)
      .where(
        and(
          eq(sourceRecords.sourceId, resolvedSourceId),
          inArray(sourceRecords.externalId, failureExternalIds),
        ),
      );
    const candidateIdByFailureExternalId = new Map(
      failedTargets.map((target) => [
        `candidate:${target.candidateId}:official-payment-crawl-failure:v3:${failureBucket}`,
        target.candidateId,
      ]),
    );
    const failureLinks = failureRows.flatMap((row) => {
      const candidateId = row.externalId
        ? candidateIdByFailureExternalId.get(row.externalId)
        : undefined;
      return candidateId
        ? [{ candidateId, sourceRecordId: row.id, relationship: 'supporting' as const }]
        : [];
    });
    if (failureLinks.length > 0) {
      await db.insert(candidateSourceRecords).values(failureLinks).onConflictDoNothing();
    }
    counters.failureMarkersPersisted = failureLinks.length;
  }

  console.log(
    JSON.stringify({
      target: EXPECTED_TARGET,
      batchIds,
      maxTargets,
      exactCandidateSelection: candidateIds !== null,
      maxInternalPagesPerCandidate: MAX_INTERNAL_PAGES,
      ...counters,
      retryableLandingFailures: targets.length - completedTargets.length,
      evidenceVisibility: 'private',
      evidenceReviewStatus: 'pending',
      candidateStateChanged: false,
      payloadExposed: false,
    }),
  );
}

await main();
