import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Args = {
  region: string;
  limit: number;
  out: string;
  log: string;
  dryRun: boolean;
  fixture: string;
  overpassUrl: string;
};

type OsmElement = {
  type?: string;
  id?: number | string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

type NormalizedRawRecord = {
  candidate_source: 'osm_overpass';
  source_id: string;
  source_url: string;
  ingested_at: string;
  raw_hash: string;
  raw_name: string;
  raw_category: string | null;
  raw_payment_tags: Record<string, string>;
  raw_chain_candidate: string | null;
  raw_chain_confidence: 'high' | 'medium' | 'low' | 'none';
  lat: number;
  lng: number;
  address_raw: string | null;
  city_raw: string | null;
  country_raw: string | null;
  website_raw: string | null;
  socials_raw: string[];
  phone_raw: string | null;
  osm_type: string;
  osm_id: string;
  raw_json: OsmElement;
};

type RegionPreset = {
  areaName: string;
  overpassAreaExpression: string;
};

const REGION_PRESETS: Record<string, RegionPreset> = {
  japan: {
    areaName: 'japan',
    overpassAreaExpression: 'area["name"="Japan"]["boundary"="administrative"]["admin_level"="2"]->.searchArea;',
  },
  germany: {
    areaName: 'germany',
    overpassAreaExpression: 'area["name"="Deutschland"]["boundary"="administrative"]["admin_level"="2"]->.searchArea;',
  },
  'europe-west': {
    areaName: 'europe-west',
    overpassAreaExpression:
      'area["name"="Europe"]["boundary"="continent"]->.searchArea; // replace with tighter polygons before live use',
  },
};

const CRYPTO_CURRENCY_ALLOWLIST = ['XBT', 'BTC', 'BCH', 'LTC', 'ETH', 'DOGE', 'USDT', 'USDC'];
const CRYPTO_PAYMENT_KEY_ALLOWLIST = [
  'payment:lightning',
  'payment:onchain',
  'payment:bitcoin',
  'payment:ethereum',
  'payment:cryptocurrency',
  'payment:crypto',
];
const PAYMENT_ACCEPTED_VALUES_PATTERN = '^(yes|limited|only)$';
const PAYMENT_ACCEPTED_VALUES = new Set(['yes', 'limited', 'only']);

const DEFAULT_FIXTURE = 'scripts/fixtures/osm_candidates_sample.json';
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function parseArgs(argv: string[]): Args {
  const pairs = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      pairs.set(key, true);
      continue;
    }
    pairs.set(key, next);
    i += 1;
  }

  const region = String(pairs.get('region') || '').trim();
  if (!region) {
    throw new Error('--region is required');
  }

  const dryRun = pairs.get('dry-run') === true;
  if (!dryRun) {
    throw new Error('This implementation is guarded: --dry-run is mandatory in this phase.');
  }

  const limitRaw = String(pairs.get('limit') || '1000');
  const limit = Number.parseInt(limitRaw, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer');
  }

  const out = String(
    pairs.get('out') || path.join('data/import/raw', `raw_osm_candidates.${region}.jsonl`),
  );
  const log = String(
    pairs.get('log') || path.join('data/import/logs', `raw_osm_candidates.${region}.log`),
  );
  const fixture = String(pairs.get('fixture') || DEFAULT_FIXTURE);
  const overpassUrl = String(pairs.get('overpass-url') || DEFAULT_OVERPASS_URL);

  return { region, limit, out, log, dryRun, fixture, overpassUrl };
}

function selectRegionPreset(region: string): RegionPreset {
  return (
    REGION_PRESETS[region] || {
      areaName: region,
      overpassAreaExpression: `// region preset not found for "${region}"; define explicit area query before live use`,
    }
  );
}

function buildOverpassQuery(region: string, limit: number): string {
  const preset = selectRegionPreset(region);
  const paymentClauses = CRYPTO_PAYMENT_KEY_ALLOWLIST.flatMap((paymentKey) =>
    ['node', 'way', 'relation'].map(
      (osmType) => `${osmType}["${paymentKey}"~"${PAYMENT_ACCEPTED_VALUES_PATTERN}"](area.searchArea);`,
    ),
  ).join('\n  ');

  const currencyClauses = CRYPTO_CURRENCY_ALLOWLIST.flatMap((symbol) =>
    ['node', 'way', 'relation'].map(
      (osmType) => `${osmType}["currency:${symbol}"~"${PAYMENT_ACCEPTED_VALUES_PATTERN}"](area.searchArea);`,
    ),
  ).join('\n  ');

  return `[out:json][timeout:120];
${preset.overpassAreaExpression}
(
  ${paymentClauses}
  ${currencyClauses}
);
out tags center ${limit};`;
}

function hasSuspiciousName(name: string | undefined): boolean {
  if (!name) return true;
  return name.trim().length === 0;
}

function isValidCoordinate(value: number | undefined, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function extractLatLng(el: OsmElement): { lat: number; lng: number } | null {
  const lat = el.type === 'node' ? el.lat : el.center?.lat;
  const lng = el.type === 'node' ? el.lon : el.center?.lon;
  if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
    return null;
  }
  return { lat, lng };
}

function pickPaymentTags(tags: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!value) continue;
    if (key.startsWith('payment:') || key.startsWith('currency:')) {
      out[key] = value;
    }
  }
  return out;
}

function isAcceptedTagValue(value: string | undefined): boolean {
  return PAYMENT_ACCEPTED_VALUES.has(String(value || '').toLowerCase());
}

function hasCryptoCandidateSignal(tags: Record<string, string | undefined>): boolean {
  for (const paymentKey of CRYPTO_PAYMENT_KEY_ALLOWLIST) {
    if (isAcceptedTagValue(tags[paymentKey])) {
      return true;
    }
  }

  for (const currencySymbol of CRYPTO_CURRENCY_ALLOWLIST) {
    if (isAcceptedTagValue(tags[`currency:${currencySymbol}`])) {
      return true;
    }
  }

  return false;
}

function inferChainCandidate(paymentTags: Record<string, string>): {
  raw_chain_candidate: string | null;
  raw_chain_confidence: 'high' | 'medium' | 'low' | 'none';
} {
  const normalize = (v: string | undefined) => (v || '').toLowerCase();
  const lightning = normalize(paymentTags['payment:lightning']);
  if (lightning === 'yes' || lightning === 'only') {
    return { raw_chain_candidate: 'Lightning', raw_chain_confidence: 'high' };
  }

  const onchain = normalize(paymentTags['payment:onchain']);
  const xbt = normalize(paymentTags['currency:XBT']) || normalize(paymentTags['currency:BTC']);
  if ((onchain === 'yes' || onchain === 'only') && xbt === 'yes') {
    return { raw_chain_candidate: 'Bitcoin', raw_chain_confidence: 'medium' };
  }

  if (Object.keys(paymentTags).length > 0) {
    return { raw_chain_candidate: null, raw_chain_confidence: 'low' };
  }
  return { raw_chain_candidate: null, raw_chain_confidence: 'none' };
}

function buildAddressRaw(tags: Record<string, string | undefined>): string | null {
  const parts = [
    tags['addr:full'],
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ').trim() || undefined,
    tags['addr:postcode'],
  ].filter(Boolean) as string[];

  if (parts.length === 0) {
    return null;
  }
  return parts.join(', ');
}

function collectSocials(tags: Record<string, string | undefined>): string[] {
  const keys = ['contact:facebook', 'contact:instagram', 'contact:twitter', 'contact:telegram', 'contact:youtube'];
  return keys.map((k) => tags[k]).filter((v): v is string => Boolean(v && v.trim()));
}

function toRawRecord(el: OsmElement, ingestedAt: string): NormalizedRawRecord | null {
  const osmType = String(el.type || 'unknown');
  const osmId = String(el.id || '').trim();
  if (!osmId) return null;

  const sourceId = `osm:${osmType}:${osmId}`;
  const sourceUrl = `https://www.openstreetmap.org/${osmType}/${osmId}`;
  const tags = el.tags || {};
  const rawName = String(tags.name || '').trim();

  if (hasSuspiciousName(rawName)) {
    return null;
  }

  if (!hasCryptoCandidateSignal(tags)) {
    return null;
  }

  const latLng = extractLatLng(el);
  if (!latLng) {
    return null;
  }

  const rawPaymentTags = pickPaymentTags(tags);
  const chain = inferChainCandidate(rawPaymentTags);

  const rawRecord: NormalizedRawRecord = {
    candidate_source: 'osm_overpass',
    source_id: sourceId,
    source_url: sourceUrl,
    ingested_at: ingestedAt,
    raw_hash: '',
    raw_name: rawName,
    raw_category: tags.shop || tags.amenity || tags.office || null,
    raw_payment_tags: rawPaymentTags,
    raw_chain_candidate: chain.raw_chain_candidate,
    raw_chain_confidence: chain.raw_chain_confidence,
    lat: latLng.lat,
    lng: latLng.lng,
    address_raw: buildAddressRaw(tags),
    city_raw: tags['addr:city'] || tags['addr:town'] || tags['addr:village'] || null,
    country_raw: tags['addr:country'] || null,
    website_raw: tags.website || tags['contact:website'] || null,
    socials_raw: collectSocials(tags),
    phone_raw: tags.phone || tags['contact:phone'] || null,
    osm_type: osmType,
    osm_id: osmId,
    raw_json: el,
  };

  rawRecord.raw_hash = createHash('sha256')
    .update(JSON.stringify(rawRecord.raw_json))
    .digest('hex');

  return rawRecord;
}

async function loadFixtureElements(filePath: string): Promise<OsmElement[]> {
  const body = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(body) as { elements?: OsmElement[] } | OsmElement[];
  if (Array.isArray(parsed)) {
    return parsed;
  }
  return Array.isArray(parsed.elements) ? parsed.elements : [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const query = buildOverpassQuery(args.region, args.limit);
  const ingestedAt = new Date().toISOString();

  await mkdir(path.dirname(args.out), { recursive: true });
  await mkdir(path.dirname(args.log), { recursive: true });

  const logs: string[] = [];
  logs.push(`[start] region=${args.region} dry_run=${String(args.dryRun)} limit=${String(args.limit)}`);
  logs.push(`[query] ${query.replace(/\s+/g, ' ').trim()}`);
  logs.push(`[query] payment_allowlist=${CRYPTO_PAYMENT_KEY_ALLOWLIST.join(',')}`);
  logs.push(`[query] currency_allowlist=${CRYPTO_CURRENCY_ALLOWLIST.join(',')}`);
  logs.push('[guard] live fetch is disabled in this phase; fixture source only');

  const sourceElements = await loadFixtureElements(args.fixture);
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  let skippedMissingName = 0;
  let skippedMissingCoords = 0;
  let skippedNonCandidate = 0;
  let failedTransform = 0;

  const seen = new Set<string>();
  const records: NormalizedRawRecord[] = [];

  for (const element of sourceElements) {
    try {
      const raw = toRawRecord(element, ingestedAt);
      if (!raw) {
        const tags = element.tags || {};
        const name = String(tags.name || '').trim();
        if (!name) {
          skippedMissingName += 1;
          logs.push(`[skip][name] type=${String(element.type)} id=${String(element.id || '')}`);
          continue;
        }
        if (!hasCryptoCandidateSignal(tags)) {
          skippedNonCandidate += 1;
          logs.push(`[skip][non_crypto_payment] type=${String(element.type)} id=${String(element.id || '')}`);
          continue;
        }
        if (!extractLatLng(element)) {
          skippedMissingCoords += 1;
          logs.push(`[skip][coords] type=${String(element.type)} id=${String(element.id || '')}`);
          continue;
        }
        skippedInvalid += 1;
        logs.push(`[skip][invalid] type=${String(element.type)} id=${String(element.id || '')}`);
        continue;
      }
      if (seen.has(raw.source_id)) {
        skippedDuplicate += 1;
        logs.push(`[skip][duplicate] source_id=${raw.source_id}`);
        continue;
      }
      seen.add(raw.source_id);
      records.push(raw);
      if (records.length >= args.limit) {
        break;
      }
    } catch (error) {
      failedTransform += 1;
      logs.push(`[error][transform] ${(error as Error).message}`);
    }
  }

  const jsonl = records.map((r) => JSON.stringify(r)).join('\n');
  await writeFile(args.out, jsonl.length > 0 ? `${jsonl}\n` : '', 'utf8');

  logs.push(`[summary] loaded=${String(sourceElements.length)}`);
  logs.push(`[summary] written=${String(records.length)}`);
  logs.push(`[summary] skipped_invalid=${String(skippedInvalid)}`);
  logs.push(`[summary] skipped_missing_name=${String(skippedMissingName)}`);
  logs.push(`[summary] skipped_non_candidate=${String(skippedNonCandidate)}`);
  logs.push(`[summary] skipped_missing_coords=${String(skippedMissingCoords)}`);
  logs.push(`[summary] skipped_duplicate=${String(skippedDuplicate)}`);
  logs.push(`[summary] failed_transform=${String(failedTransform)}`);
  logs.push(`[done] out=${args.out}`);

  await writeFile(args.log, `${logs.join('\n')}\n`, 'utf8');

  console.log(`dry-run complete: wrote ${records.length} records to ${args.out}`);
  console.log(`log file: ${args.log}`);
}

main().catch((error) => {
  console.error('[fatal]', (error as Error).message);
  process.exitCode = 1;
});
