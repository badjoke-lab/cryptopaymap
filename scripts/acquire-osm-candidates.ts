import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { createDatabase, type CryptoPayMapDatabase } from '../src/db/client';
import { licenses, sourceCandidates, sources } from '../src/db/schema';
import {
  persistOsmOverpassCandidateAcquisition,
  type OsmOverpassElement,
} from '../src/importers/osm-overpass-candidate-acquisition';

const REQUIRED_TARGET = 'fixed-review-staging';
const OSM_SOURCE_NAME = 'OpenStreetMap via Overpass API';
const OSM_LICENSE_SLUG = 'odbl-1-0';
const IMPORTER_VERSION = 'osm-overpass-v1';
const OVERPASS_ENDPOINT =
  process.env.CPM_OVERPASS_ENDPOINT?.trim() || 'https://overpass-api.de/api/interpreter';

const scopes = {
  japan: {
    label: 'Japan',
    bbox: '20.214581,122.714175,45.711204,154.205542',
  },
  tokyo: {
    label: 'Tokyo metro',
    bbox: '35.45,139.35,35.95,140.05',
  },
} as const;

type ScopeName = keyof typeof scopes;

type OverpassResponse = {
  elements?: unknown;
};

function requireEnvironment(): { databaseUrl: string; scopeName: ScopeName } {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== REQUIRED_TARGET) {
    throw new Error(
      `Refusing Candidate acquisition unless CPM_CANDIDATE_ACQUISITION_TARGET=${REQUIRED_TARGET}.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');

  const rawScope = (process.argv[2] ?? 'japan').trim();
  if (!(rawScope in scopes)) {
    throw new Error(`Unsupported OSM acquisition scope: ${rawScope}`);
  }

  return { databaseUrl, scopeName: rawScope as ScopeName };
}

function buildOverpassQuery(bbox: string): string {
  const paymentKeys = [
    'payment:bitcoin',
    'payment:bitcoin_cash',
    'payment:lightning',
    'payment:litecoin',
    'payment:dogecoin',
    'payment:dash',
    'payment:monero',
    'payment:ethereum',
    'payment:cryptocurrencies',
  ];
  const selectors = paymentKeys
    .map((key) => `nwr["${key}"~"^(yes|only)$"](${bbox});`)
    .join('\n  ');
  return `[out:json][timeout:180];\n(\n  ${selectors}\n);\nout center tags qt;`;
}

function isOsmElement(value: unknown): value is OsmOverpassElement {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.type === 'node' || record.type === 'way' || record.type === 'relation') &&
    typeof record.id === 'number' &&
    Number.isSafeInteger(record.id)
  );
}

async function fetchOsmElements(scopeName: ScopeName): Promise<OsmOverpassElement[]> {
  const query = buildOverpassQuery(scopes[scopeName].bbox);
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'CryptoPayMap/0.0.0 (https://github.com/badjoke-lab/cryptopaymap)',
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(210_000),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as OverpassResponse;
  if (!Array.isArray(payload.elements)) {
    throw new Error('Overpass response did not contain an elements array.');
  }

  const deduplicated = new Map<string, OsmOverpassElement>();
  for (const value of payload.elements) {
    if (!isOsmElement(value)) continue;
    deduplicated.set(`${value.type}:${value.id}`, value);
  }

  const elements = [...deduplicated.values()].sort((left, right) => {
    const typeOrder = left.type.localeCompare(right.type);
    return typeOrder !== 0 ? typeOrder : left.id - right.id;
  });

  if (elements.length === 0) {
    throw new Error(`Overpass returned zero usable elements for ${scopes[scopeName].label}.`);
  }
  if (elements.length > 10_000) {
    throw new Error(
      `Overpass returned ${elements.length} elements; split the scope before Candidate ingestion.`,
    );
  }

  return elements;
}

async function ensureOsmProvenance(database: CryptoPayMapDatabase) {
  let license = (
    await database.select().from(licenses).where(eq(licenses.slug, OSM_LICENSE_SLUG)).limit(1)
  )[0];
  if (!license) {
    [license] = await database
      .insert(licenses)
      .values({
        id: randomUUID(),
        slug: OSM_LICENSE_SLUG,
        name: 'Open Database License (ODbL)',
        version: '1.0',
        url: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attributionRequired: true,
        shareAlike: true,
      })
      .returning();
  }
  if (!license) throw new Error('Failed to resolve the ODbL license row.');

  let source = (
    await database
      .select()
      .from(sources)
      .where(and(eq(sources.sourceType, 'osm'), eq(sources.name, OSM_SOURCE_NAME)))
      .limit(1)
  )[0];
  if (!source) {
    [source] = await database
      .insert(sources)
      .values({
        id: randomUUID(),
        sourceType: 'osm',
        name: OSM_SOURCE_NAME,
        baseUrl: 'https://www.openstreetmap.org/',
        defaultLicenseId: license.id,
        attributionText: '© OpenStreetMap contributors',
        isActive: true,
      })
      .returning();
  }
  if (!source) throw new Error('Failed to resolve the OpenStreetMap source row.');

  return { source, license };
}

async function candidateCount(database: CryptoPayMapDatabase): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceCandidates);
  return Number(row?.count ?? 0);
}

async function main() {
  const { databaseUrl, scopeName } = requireEnvironment();
  const elements = await fetchOsmElements(scopeName);
  const database = createDatabase(databaseUrl);
  const before = await candidateCount(database);
  const { source, license } = await ensureOsmProvenance(database);
  const fetchedAt = new Date();

  const receipt = await persistOsmOverpassCandidateAcquisition(database, {
    requestId: randomUUID(),
    importBatchId: randomUUID(),
    sourceId: source.id,
    licenseId: license.id,
    fetchedAt,
    importerVersion: IMPORTER_VERSION,
    elements,
  });

  const after = await candidateCount(database);
  const summary = {
    target: REQUIRED_TARGET,
    scope: scopeName,
    fetchedElements: elements.length,
    candidateTotalBefore: before,
    candidateTotalAfter: after,
    candidateDelta: after - before,
    ingestion: receipt,
  };

  console.log(JSON.stringify(summary));

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `scope=${scopeName}`,
        `fetched_elements=${elements.length}`,
        `candidate_total_before=${before}`,
        `candidate_total_after=${after}`,
        `candidate_delta=${after - before}`,
        `accepted_count=${receipt.acceptedCount}`,
        `rejected_count=${receipt.rejectedCount}`,
        `replayed_count=${receipt.replayedCount}`,
        `duplicate_signal_count=${receipt.duplicateSignalCount}`,
        `automatic_confirmed_count=${receipt.automaticConfirmedCount}`,
        `receipt_state=${receipt.state}`,
      ].join('\n') + '\n',
    );
  }
}

await main();
