import { and, asc, eq, inArray } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, evidence, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };

const EXPECTED_TARGET = 'fixed-review-staging';
const BATCH_IDS = [
  '717d2960-e20a-4199-b36b-d338c6b00fe5',
  '9cbf6d49-655b-448a-bb85-bfed2be27ad2',
  '2ce88936-2f37-4131-8806-9f39677aa40e',
  '10d759a6-993e-44b7-ad29-64afd21a6f6f',
  '6b80094e-82de-4373-9705-3db969162a9e',
] as const;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BODY_CHARS = 750_000;

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function privateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function safeUrl(raw: string, officialDomain: string): URL | null {
  try {
    const url = new URL(raw);
    const host = normalizeHost(url.hostname);
    const domain = normalizeHost(officialDomain);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || privateIpv4(host)) return null;
    if (!domain || (host !== domain && !host.endsWith(`.${domain}`) && !domain.endsWith(`.${host}`))) return null;
    return url;
  } catch {
    return null;
  }
}

function textFromHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function cryptoContexts(text: string): string[] {
  const lower = text.toLowerCase();
  const needles = ['cryptocurrency', 'crypto', 'bitcoin', 'btc', 'lightning', 'крипто', 'krypto'];
  const starts = new Set<number>();
  for (const needle of needles) {
    let at = lower.indexOf(needle);
    while (at >= 0) {
      starts.add(at);
      at = lower.indexOf(needle, at + needle.length);
    }
  }
  return [...starts]
    .sort((a, b) => a - b)
    .slice(0, 12)
    .map((at) => text.slice(Math.max(0, at - 700), Math.min(text.length, at + 1100)));
}

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== EXPECTED_TARGET) throw new Error('Refusing outside fixed-review staging.');
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(databaseUrl);

  const rows = await db
    .select({ candidateId: sourceCandidates.id, sourceUrl: evidence.sourceUrl, officialDomain: sourceRecords.officialDomain })
    .from(evidence)
    .innerJoin(candidateSourceRecords, eq(candidateSourceRecords.sourceRecordId, evidence.sourceRecordId))
    .innerJoin(sourceCandidates, eq(sourceCandidates.id, candidateSourceRecords.candidateId))
    .innerJoin(sourceRecords, eq(sourceRecords.id, evidence.sourceRecordId))
    .where(and(inArray(sourceCandidates.importBatchId, [...BATCH_IDS]), eq(evidence.evidenceKind, 'official_payment_page')))
    .orderBy(asc(sourceCandidates.id));

  const details: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const sourceUrl = row.sourceUrl?.trim() ?? '';
    const officialDomain = row.officialDomain?.trim() ?? '';
    const url = sourceUrl && officialDomain ? safeUrl(sourceUrl, officialDomain) : null;
    if (!url) {
      details.push({ sourceUrl, fetchSucceeded: false, contexts: [] });
      continue;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': 'CryptoPayMap-private-review/1.0', accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' } });
      const text = response.ok ? textFromHtml((await response.text()).slice(0, MAX_BODY_CHARS)) : '';
      details.push({ sourceUrl, fetchSucceeded: response.ok, status: response.status, contexts: cryptoContexts(text) });
    } catch {
      details.push({ sourceUrl, fetchSucceeded: false, contexts: [] });
    } finally {
      clearTimeout(timeout);
    }
  }

  process.stdout.write(JSON.stringify({ target: EXPECTED_TARGET, rows: rows.length, mutationPerformed: false, publicDataChanged: false, payloadExposedInLogs: false, details }));
}

await main();
