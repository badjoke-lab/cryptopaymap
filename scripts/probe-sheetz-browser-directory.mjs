import { chromium } from 'playwright-core';

const PAGE_URL = 'https://orders.sheetz.com/findASheetz';
const API_PREFIX = 'https://orders.sheetz.com/anybff/api';
const PAGE_SIZE = 100;
const MAX_PAGES_PER_STATE = 100;
const DEFAULT_LATITUDE = 40.47275;
const DEFAULT_LONGITUDE = -78.42507;

const STATE_BY_NAME = new Map(
  [
    ['Alabama', 'AL'],
    ['Alaska', 'AK'],
    ['Arizona', 'AZ'],
    ['Arkansas', 'AR'],
    ['California', 'CA'],
    ['Colorado', 'CO'],
    ['Connecticut', 'CT'],
    ['Delaware', 'DE'],
    ['District of Columbia', 'DC'],
    ['Florida', 'FL'],
    ['Georgia', 'GA'],
    ['Hawaii', 'HI'],
    ['Idaho', 'ID'],
    ['Illinois', 'IL'],
    ['Indiana', 'IN'],
    ['Iowa', 'IA'],
    ['Kansas', 'KS'],
    ['Kentucky', 'KY'],
    ['Louisiana', 'LA'],
    ['Maine', 'ME'],
    ['Maryland', 'MD'],
    ['Massachusetts', 'MA'],
    ['Michigan', 'MI'],
    ['Minnesota', 'MN'],
    ['Mississippi', 'MS'],
    ['Missouri', 'MO'],
    ['Montana', 'MT'],
    ['Nebraska', 'NE'],
    ['Nevada', 'NV'],
    ['New Hampshire', 'NH'],
    ['New Jersey', 'NJ'],
    ['New Mexico', 'NM'],
    ['New York', 'NY'],
    ['North Carolina', 'NC'],
    ['North Dakota', 'ND'],
    ['Ohio', 'OH'],
    ['Oklahoma', 'OK'],
    ['Oregon', 'OR'],
    ['Pennsylvania', 'PA'],
    ['Rhode Island', 'RI'],
    ['South Carolina', 'SC'],
    ['South Dakota', 'SD'],
    ['Tennessee', 'TN'],
    ['Texas', 'TX'],
    ['Utah', 'UT'],
    ['Vermont', 'VT'],
    ['Virginia', 'VA'],
    ['Washington', 'WA'],
    ['West Virginia', 'WV'],
    ['Wisconsin', 'WI'],
    ['Wyoming', 'WY'],
  ].map(([name, code]) => [name.toUpperCase(), code]),
);

function fail(message) {
  throw new Error(message);
}

function stateCodes(payload) {
  const states = payload?.states;
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    fail(`Unexpected operating-states payload: ${JSON.stringify(payload)}`);
  }

  const codes = new Set();
  for (const [rawKey, rawValue] of Object.entries(states)) {
    const key = String(rawKey).trim().toUpperCase();
    const value = String(rawValue ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(key)) codes.add(key);
    if (/^[A-Z]{2}$/.test(value)) codes.add(value);
    const byKeyName = STATE_BY_NAME.get(key);
    const byValueName = STATE_BY_NAME.get(value);
    if (byKeyName) codes.add(byKeyName);
    if (byValueName) codes.add(byValueName);
  }

  if (codes.size === 0) {
    fail(`Operating states could not be mapped to state codes: ${JSON.stringify(states)}`);
  }
  return [...codes].sort();
}

async function jsonResponse(response, label) {
  const text = await response.text();
  if (!response.ok()) {
    fail(`${label} failed HTTP ${response.status()}: ${text.slice(0, 1000)}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    fail(`${label} returned non-JSON: ${text.slice(0, 1000)}`);
  }
}

async function main() {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) fail('CHROME_PATH is required.');

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        referer: PAGE_URL,
      },
    });

    // Bootstrap the merchant-owned origin/cookies without keeping a renderer page alive.
    const bootstrap = await context.request.get(PAGE_URL, { timeout: 45_000 });
    if (!bootstrap.ok()) {
      fail(`Locator bootstrap failed HTTP ${bootstrap.status()}`);
    }

    const statesResponse = await context.request.get(`${API_PREFIX}/stores/getOperatingStates`, {
      timeout: 45_000,
      headers: { origin: 'https://orders.sheetz.com' },
    });
    const statesPayload = await jsonResponse(statesResponse, 'Operating-states request');
    const states = stateCodes(statesPayload);

    const rows = [];
    const stateCounts = {};
    const statePageSizes = {};

    for (const state of states) {
      let count = 0;
      let firstPageSize = null;
      const pageSignatures = new Set();

      for (let pageNumber = 0; pageNumber < MAX_PAGES_PER_STATE; pageNumber += 1) {
        const params = new URLSearchParams({
          stateCode: state,
          page: String(pageNumber),
          size: String(PAGE_SIZE),
          latitude: String(DEFAULT_LATITUDE),
          longitude: String(DEFAULT_LONGITUDE),
        });
        const response = await context.request.post(
          `${API_PREFIX}/stores/search?${params.toString()}`,
          {
            timeout: 45_000,
            headers: {
              origin: 'https://orders.sheetz.com',
              'content-type': 'application/json',
            },
            data: {},
          },
        );
        const payload = await jsonResponse(response, `Search ${state} page ${pageNumber}`);
        const stores = Array.isArray(payload?.stores) ? payload.stores : null;
        if (!stores) {
          fail(`Search payload missing stores for ${state} page ${pageNumber}: ${JSON.stringify(payload)}`);
        }
        if (firstPageSize === null) firstPageSize = stores.length;
        if (stores.length === 0) break;

        const signature = stores.map((store) => String(store?.storeNumber ?? '?')).join(',');
        if (pageSignatures.has(signature)) {
          fail(`Pagination repeated a page for ${state} at page ${pageNumber}.`);
        }
        pageSignatures.add(signature);

        for (const store of stores) {
          const actualState = String(store?.state ?? '').trim().toUpperCase();
          if (actualState && actualState !== state) {
            fail(`State mismatch: requested ${state}, got ${actualState} store ${store?.storeNumber ?? '?'}`);
          }
          rows.push(store);
          count += 1;
        }

        if (pageNumber === MAX_PAGES_PER_STATE - 1) {
          fail(`Pagination guard tripped for ${state}`);
        }
      }

      stateCounts[state] = count;
      statePageSizes[state] = firstPageSize ?? 0;
    }

    const storeNumbers = rows.map((row) => String(row?.storeNumber ?? '').trim()).filter(Boolean);
    const uniqueStoreNumbers = new Set(storeNumbers);
    const validCoordinates = rows.filter(
      (row) => Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude)),
    ).length;
    const coordinateKeys = rows
      .filter((row) => Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude)))
      .map((row) => `${Number(row.latitude).toFixed(6)},${Number(row.longitude).toFixed(6)}`);
    const uniqueCoordinates = new Set(coordinateKeys);
    const withAddress = rows.filter((row) => typeof row?.address === 'string' && row.address.trim()).length;
    const withCity = rows.filter((row) => typeof row?.city === 'string' && row.city.trim()).length;
    const withPostalCode = rows.filter((row) => typeof row?.zip === 'string' && row.zip.trim()).length;
    const withPhone = rows.filter((row) => {
      const value = row?.phone ?? row?.phoneNumber;
      return typeof value === 'string' && value.trim();
    }).length;
    const explicitlyOpen24x7 = rows.filter((row) => row?.features?.open24x7 === true).length;
    const cryptoFlexaPayTrue = rows.filter((row) => row?.features?.cryptoFlexaPay === true).length;
    const cryptoFlexaPayFalse = rows.filter((row) => row?.features?.cryptoFlexaPay === false).length;
    const cryptoFlexaPayMissing = rows.length - cryptoFlexaPayTrue - cryptoFlexaPayFalse;
    const sampleKeys = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))].sort();
    const featureKeys = [
      ...new Set(
        rows.flatMap((row) =>
          row?.features && typeof row.features === 'object' ? Object.keys(row.features) : [],
        ),
      ),
    ].sort();

    console.log(
      JSON.stringify({
        source: `${API_PREFIX}/stores/search`,
        locator: PAGE_URL,
        fetchedAt: new Date().toISOString(),
        operatingStatesPayload: statesPayload,
        operatingStates: states,
        officialDirectoryFetched: rows.length,
        storeNumberRows: storeNumbers.length,
        uniqueStoreNumbers: uniqueStoreNumbers.size,
        duplicateStoreNumbers: storeNumbers.length - uniqueStoreNumbers.size,
        validCoordinates,
        uniqueCoordinates: uniqueCoordinates.size,
        duplicateCoordinates: coordinateKeys.length - uniqueCoordinates.size,
        withAddress,
        withCity,
        withPostalCode,
        withPhone,
        explicitlyOpen24x7,
        cryptoFlexaPayTrue,
        cryptoFlexaPayFalse,
        cryptoFlexaPayMissing,
        stateCounts,
        statePageSizes,
        sampleKeys,
        featureKeys,
      }),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});