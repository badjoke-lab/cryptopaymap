import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sourceUrl = new URL('./ingest-chipotle-official-state-physical-candidates-staging.ts', import.meta.url);
const temporaryUrl = new URL('./.tmp-ingest-chipotle-official-state-physical-candidates-staging.ts', import.meta.url);

let source = await readFile(sourceUrl, 'utf8');
const state = (process.env.CPM_CHIPOTLE_STATE ?? '').trim().toLowerCase();
if (state === 'fl') {
  const oldMinimums = "const STATE_MINIMUMS: Record<string, number> = { tx: 300, ca: 450 };";
  const newMinimums = "const STATE_MINIMUMS: Record<string, number> = { tx: 300, ca: 450, fl: 250 };";
  if (!source.includes(oldMinimums)) {
    throw new Error('Chipotle state minimum patch target changed unexpectedly.');
  }
  source = source.replace(oldMinimums, newMinimums);
}

const start = source.indexOf('async function geocode(seed: AddressSeed): Promise<LocationSeed | null> {');
const end = source.indexOf('function coordinatesFromPayload', start);
if (start < 0 || end < 0) {
  throw new Error('Chipotle state geocode patch target changed unexpectedly.');
}

const resilientGeocode = `async function geocode(seed: AddressSeed): Promise<LocationSeed | null> {
  if (seed.latitude !== null && seed.longitude !== null) {
    return {
      ...seed,
      latitude: seed.latitude,
      longitude: seed.longitude,
      coordinateSource: 'official_jsonld',
    };
  }
  const query = \`\${seed.address}, \${seed.city}, \${seed.state} \${seed.postalCode ?? ''}, USA\`;
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('q', query);
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        'user-agent': 'CryptoPayMap/1.0 (https://github.com/badjoke-lab/cryptopaymap)',
        accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const lat = Number(rows[0]?.lat);
    const lon = Number(rows[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { ...seed, latitude: lat, longitude: lon, coordinateSource: 'nominatim' };
  } catch {
    return null;
  }
}
`;

const patched = `${source.slice(0, start)}${resilientGeocode}\n${source.slice(end)}`;
await writeFile(temporaryUrl, patched, 'utf8');
try {
  execFileSync('npx', ['tsx', fileURLToPath(temporaryUrl)], {
    stdio: 'inherit',
    env: process.env,
  });
} finally {
  await rm(temporaryUrl, { force: true });
}
