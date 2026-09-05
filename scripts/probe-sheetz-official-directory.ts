export {};

declare const process: { env: Record<string, string | undefined>; exitCode?: number };

type JsonRecord = Record<string, unknown>;

type StoreRow = {
  storeNumber: string;
  state: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  open24x7: boolean | null;
  rawKeys: string[];
};

const BASE = 'https://orders.sheetz.com';
const LOCATOR_URL = `${BASE}/findASheetz`;
const STATES_URL = `${BASE}/anybff/api/stores/getOperatingStates`;
const SEARCH_URL = `${BASE}/anybff/api/stores/search`;
const PAGE_SIZE = 100;
const MAX_PAGES_PER_STATE = 20;
const MIN_EXPECTED_STORES = 700;
const MAX_EXPECTED_STORES = 1200;
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

function object(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parseStore(value: unknown): StoreRow | null {
  const row = object(value);
  const features = object(row.features);
  const storeNumber = stringOrNull(row.storeNumber);
  const state = stringOrNull(row.state)?.toUpperCase() ?? null;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (
    !storeNumber ||
    !state ||
    !/^[A-Z]{2}$/.test(state) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return {
    storeNumber,
    state,
    latitude,
    longitude,
    address: stringOrNull(row.address),
    city: stringOrNull(row.city),
    postalCode: stringOrNull(row.zip ?? row.zipCode ?? row.postalCode),
    phone: stringOrNull(row.phone ?? row.phoneNumber),
    open24x7: typeof features.open24x7 === 'boolean' ? features.open24x7 : null,
    rawKeys: Object.keys(row).sort(),
  };
}

function requestHeaders(cookie?: string): Record<string, string> {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    origin: BASE,
    referer: LOCATOR_URL,
    'user-agent': BROWSER_USER_AGENT,
    ...(cookie ? { cookie } : {}),
  };
}

function htmlHeaders(): Record<string, string> {
  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': BROWSER_USER_AGENT,
  };
}

function cookieHeader(response: Response): string | undefined {
  const raw = response.headers.get('set-cookie');
  if (!raw) return undefined;
  return raw
    .split(/,(?=\s*[^;,]+=)/)
    .map((part) => part.trim().split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

function scriptSources(html: string): string[] {
  const sources = new Set<string>();
  for (const match of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    const src = match[1];
    if (!src) continue;
    try {
      sources.add(new URL(src, LOCATOR_URL).toString());
    } catch {
      // Ignore malformed script URLs from diagnostics.
    }
  }
  return [...sources].slice(0, 80);
}

function apiStrings(text: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\/(?:anybff|api)\/[^"'`\\\s<>]{1,180}/gi,
    /[^"'`\\\s<>]{0,80}(?:getOperatingStates|stateCode|findASheetz|stores\/search)[^"'`\\\s<>]{0,120}/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0]?.trim();
      if (value && /store|sheetz|location|state/i.test(value)) found.add(value);
    }
  }
  return [...found].slice(0, 120);
}

async function discoverLiveLocatorApi(): Promise<{ cookie?: string; diagnostics: JsonRecord }> {
  const page = await fetch(LOCATOR_URL, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: htmlHeaders(),
  });
  const html = await page.text();
  const cookie = cookieHeader(page);
  const scripts = scriptSources(html);
  const directMatches = apiStrings(html);
  const bundleMatches = new Set<string>();
  const bundleStatuses: Array<{ url: string; status: number; bytes: number }> = [];

  for (const scriptUrl of scripts) {
    try {
      const response = await fetch(scriptUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: {
          accept: '*/*',
          referer: LOCATOR_URL,
          'user-agent': BROWSER_USER_AGENT,
          ...(cookie ? { cookie } : {}),
        },
      });
      const body = await response.text();
      bundleStatuses.push({ url: scriptUrl, status: response.status, bytes: body.length });
      if (!response.ok) continue;
      for (const value of apiStrings(body)) bundleMatches.add(value);
    } catch (error) {
      bundleStatuses.push({
        url: scriptUrl,
        status: 0,
        bytes: error instanceof Error ? error.message.length : 0,
      });
    }
  }

  const diagnostics: JsonRecord = {
    locatorStatus: page.status,
    locatorFinalUrl: page.url,
    locatorBytes: html.length,
    locatorContentType: page.headers.get('content-type'),
    setCookiePresent: Boolean(cookie),
    scriptCount: scripts.length,
    scriptUrls: scripts,
    directMatches,
    bundleStatuses,
    bundleMatches: [...bundleMatches],
  };
  return cookie ? { cookie, diagnostics } : { diagnostics };
}

async function fetchJson(url: string, init?: RequestInit, cookie?: string): Promise<unknown> {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: requestHeaders(cookie),
    ...init,
  });
  if (!response.ok) throw new Error(`Sheetz official API returned HTTP ${response.status}: ${url}`);
  if (new URL(response.url).hostname !== 'orders.sheetz.com') {
    throw new Error(`Sheetz API redirected off official domain: ${response.url}`);
  }
  return response.json() as Promise<unknown>;
}

async function fetchOperatingStates(cookie?: string): Promise<string[]> {
  const payload = object(await fetchJson(STATES_URL, { method: 'GET' }, cookie));
  const states = object(payload.states);
  const result = Object.keys(states)
    .map((state) => state.trim().toUpperCase())
    .filter((state) => /^[A-Z]{2}$/.test(state))
    .sort();
  if (result.length === 0) throw new Error('Sheetz official API returned no operating states.');
  return result;
}

async function fetchState(state: string, cookie?: string): Promise<StoreRow[]> {
  const rows: StoreRow[] = [];
  for (let page = 0; page < MAX_PAGES_PER_STATE; page += 1) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set('stateCode', state);
    url.searchParams.set('page', String(page));
    url.searchParams.set('size', String(PAGE_SIZE));
    const payload = object(
      await fetchJson(
        url.toString(),
        {
          method: 'POST',
          body: '{}',
        },
        cookie,
      ),
    );
    const rawStores = Array.isArray(payload.stores) ? payload.stores : [];
    if (rawStores.length === 0) return rows;
    const parsed = rawStores.map(parseStore);
    const invalid = parsed.filter((row) => row === null).length;
    if (invalid > 0) {
      throw new Error(`Sheetz ${state} page ${page} had ${invalid} rows without identity/coordinates.`);
    }
    rows.push(...(parsed as StoreRow[]));
    if (rawStores.length < PAGE_SIZE) return rows;
  }
  throw new Error(`Sheetz ${state} exceeded ${MAX_PAGES_PER_STATE} pages; pagination guard tripped.`);
}

async function main(): Promise<void> {
  const live = await discoverLiveLocatorApi();
  console.error(`SHEETZ_LOCATOR_DIAGNOSTICS=${JSON.stringify(live.diagnostics)}`);

  let states: string[];
  try {
    states = await fetchOperatingStates(live.cookie);
  } catch (error) {
    throw new Error(
      `Known Sheetz BFF contract failed after live-locator discovery. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const byState = new Map<string, StoreRow[]>();
  for (const state of states) {
    byState.set(state, await fetchState(state, live.cookie));
  }
  const rows = Array.from(byState.values()).flat();
  if (rows.length < MIN_EXPECTED_STORES || rows.length > MAX_EXPECTED_STORES) {
    throw new Error(`Sheetz official-directory count outside guard range: ${rows.length}.`);
  }

  const storeNumbers = new Set(rows.map((row) => row.storeNumber));
  const coordinateKeys = new Set(rows.map((row) => `${row.latitude.toFixed(6)},${row.longitude.toFixed(6)}`));
  const duplicateStoreNumbers = rows.length - storeNumbers.size;
  const duplicateCoordinates = rows.length - coordinateKeys.size;
  const stateCounts = Object.fromEntries(
    [...byState.entries()]
      .map(([state, items]): [string, number] => [state, items.length])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const sampleKeys = [...new Set(rows.flatMap((row) => row.rawKeys))].sort();

  const result = {
    source: SEARCH_URL,
    fetchedAt: new Date().toISOString(),
    operatingStates: states,
    officialDirectoryFetched: rows.length,
    uniqueStoreNumbers: storeNumbers.size,
    duplicateStoreNumbers,
    validCoordinates: rows.length,
    uniqueCoordinates: coordinateKeys.size,
    duplicateCoordinates,
    withAddress: rows.filter((row) => row.address).length,
    withCity: rows.filter((row) => row.city).length,
    withPostalCode: rows.filter((row) => row.postalCode).length,
    withPhone: rows.filter((row) => row.phone).length,
    explicitlyOpen24x7: rows.filter((row) => row.open24x7 === true).length,
    stateCounts,
    sampleKeys,
  };
  console.log(JSON.stringify(result));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
