import { chromium } from 'playwright-core';

const PAGE_URL = 'https://orders.sheetz.com/findASheetz';
const API_PREFIX = 'https://orders.sheetz.com/anybff/api';
const PAGE_SIZE = 100;
const MAX_PAGES_PER_STATE = 100;
const DEFAULT_LATITUDE = 40.47275;
const DEFAULT_LONGITUDE = -78.42507;
const STATE_BY_NAME = new Map([
  ['ALABAMA','AL'],['ALASKA','AK'],['ARIZONA','AZ'],['ARKANSAS','AR'],['CALIFORNIA','CA'],
  ['COLORADO','CO'],['CONNECTICUT','CT'],['DELAWARE','DE'],['DISTRICT OF COLUMBIA','DC'],
  ['FLORIDA','FL'],['GEORGIA','GA'],['HAWAII','HI'],['IDAHO','ID'],['ILLINOIS','IL'],
  ['INDIANA','IN'],['IOWA','IA'],['KANSAS','KS'],['KENTUCKY','KY'],['LOUISIANA','LA'],
  ['MAINE','ME'],['MARYLAND','MD'],['MASSACHUSETTS','MA'],['MICHIGAN','MI'],['MINNESOTA','MN'],
  ['MISSISSIPPI','MS'],['MISSOURI','MO'],['MONTANA','MT'],['NEBRASKA','NE'],['NEVADA','NV'],
  ['NEW HAMPSHIRE','NH'],['NEW JERSEY','NJ'],['NEW MEXICO','NM'],['NEW YORK','NY'],
  ['NORTH CAROLINA','NC'],['NORTH DAKOTA','ND'],['OHIO','OH'],['OKLAHOMA','OK'],['OREGON','OR'],
  ['PENNSYLVANIA','PA'],['RHODE ISLAND','RI'],['SOUTH CAROLINA','SC'],['SOUTH DAKOTA','SD'],
  ['TENNESSEE','TN'],['TEXAS','TX'],['UTAH','UT'],['VERMONT','VT'],['VIRGINIA','VA'],
  ['WASHINGTON','WA'],['WEST VIRGINIA','WV'],['WISCONSIN','WI'],['WYOMING','WY'],
]);

function fail(message) { throw new Error(message); }

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
    if (STATE_BY_NAME.has(key)) codes.add(STATE_BY_NAME.get(key));
    if (STATE_BY_NAME.has(value)) codes.add(STATE_BY_NAME.get(value));
  }
  if (codes.size === 0) fail(`Operating states could not be mapped: ${JSON.stringify(states)}`);
  return [...codes].sort();
}

async function jsonResponse(response, label) {
  const text = await response.text();
  if (!response.ok()) fail(`${label} failed HTTP ${response.status()}: ${text.slice(0, 1000)}`);
  try { return text ? JSON.parse(text) : null; }
  catch { fail(`${label} returned non-JSON: ${text.slice(0, 1000)}`); }
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        referer: PAGE_URL,
      },
    });
    const bootstrap = await context.request.get(PAGE_URL, { timeout: 45_000 });
    if (!bootstrap.ok()) fail(`Locator bootstrap failed HTTP ${bootstrap.status()}`);
    const statesPayload = await jsonResponse(
      await context.request.get(`${API_PREFIX}/stores/getOperatingStates`, {
        timeout: 45_000,
        headers: { origin: 'https://orders.sheetz.com' },
      }),
      'Operating-states request',
    );
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
        const payload = await jsonResponse(
          await context.request.post(`${API_PREFIX}/stores/search?${params}`, {
            timeout: 45_000,
            headers: { origin: 'https://orders.sheetz.com', 'content-type': 'application/json' },
            data: {},
          }),
          `Search ${state} page ${pageNumber}`,
        );
        const stores = Array.isArray(payload?.stores) ? payload.stores : null;
        if (!stores) fail(`Search payload missing stores for ${state} page ${pageNumber}`);
        if (firstPageSize === null) firstPageSize = stores.length;
        if (stores.length === 0) break;
        const signature = stores.map((store) => String(store?.storeNumber ?? '?')).join(',');
        if (pageSignatures.has(signature)) fail(`Pagination repeated for ${state} page ${pageNumber}`);
        pageSignatures.add(signature);
        for (const store of stores) {
          const actualState = String(store?.state ?? '').trim().toUpperCase();
          if (actualState && actualState !== state) {
            fail(`State mismatch: requested ${state}, got ${actualState} store ${store?.storeNumber ?? '?'}`);
          }
          rows.push(store);
          count += 1;
        }
        if (pageNumber === MAX_PAGES_PER_STATE - 1) fail(`Pagination guard tripped for ${state}`);
      }
      stateCounts[state] = count;
      statePageSizes[state] = firstPageSize ?? 0;
    }

    const storeNumbers = rows.map((row) => String(row?.storeNumber ?? '').trim()).filter(Boolean);
    const coordinateKeys = rows
      .filter((row) => Number.isFinite(Number(row?.latitude)) && Number.isFinite(Number(row?.longitude)))
      .map((row) => `${Number(row.latitude).toFixed(6)},${Number(row.longitude).toFixed(6)}`);
    const cryptoFlexaPayTrue = rows.filter((row) => row?.features?.cryptoFlexaPay === true).length;
    const cryptoFlexaPayFalse = rows.filter((row) => row?.features?.cryptoFlexaPay === false).length;
    const cryptoFlexaPayMissing = rows.length - cryptoFlexaPayTrue - cryptoFlexaPayFalse;
    const cryptoCurrencyAcceptanceTrue = rows.filter((row) => row?.features?.cryptoCurrencyAcceptance === true).length;
    const cryptoCurrencyAcceptanceFalse = rows.filter((row) => row?.features?.cryptoCurrencyAcceptance === false).length;
    const cryptoCurrencyAcceptanceMissing = rows.length - cryptoCurrencyAcceptanceTrue - cryptoCurrencyAcceptanceFalse;
    const cryptoFlagCrossTab = {
      bothTrue: rows.filter((row) => row?.features?.cryptoFlexaPay === true && row?.features?.cryptoCurrencyAcceptance === true).length,
      flexaTrueCurrencyFalse: rows.filter((row) => row?.features?.cryptoFlexaPay === true && row?.features?.cryptoCurrencyAcceptance === false).length,
      flexaFalseCurrencyTrue: rows.filter((row) => row?.features?.cryptoFlexaPay === false && row?.features?.cryptoCurrencyAcceptance === true).length,
      bothFalse: rows.filter((row) => row?.features?.cryptoFlexaPay === false && row?.features?.cryptoCurrencyAcceptance === false).length,
      anyMissing: rows.filter((row) => typeof row?.features?.cryptoFlexaPay !== 'boolean' || typeof row?.features?.cryptoCurrencyAcceptance !== 'boolean').length,
    };
    const sampleKeys = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))].sort();
    const featureKeys = [...new Set(rows.flatMap((row) => row?.features && typeof row.features === 'object' ? Object.keys(row.features) : []))].sort();

    console.log(JSON.stringify({
      source: `${API_PREFIX}/stores/search`,
      locator: PAGE_URL,
      fetchedAt: new Date().toISOString(),
      operatingStatesPayload: statesPayload,
      operatingStates: states,
      officialDirectoryFetched: rows.length,
      storeNumberRows: storeNumbers.length,
      uniqueStoreNumbers: new Set(storeNumbers).size,
      duplicateStoreNumbers: storeNumbers.length - new Set(storeNumbers).size,
      validCoordinates: coordinateKeys.length,
      uniqueCoordinates: new Set(coordinateKeys).size,
      duplicateCoordinates: coordinateKeys.length - new Set(coordinateKeys).size,
      withAddress: rows.filter((row) => typeof row?.address === 'string' && row.address.trim()).length,
      withCity: rows.filter((row) => typeof row?.city === 'string' && row.city.trim()).length,
      withPostalCode: rows.filter((row) => typeof row?.zip === 'string' && row.zip.trim()).length,
      withPhone: rows.filter((row) => typeof row?.phone === 'string' && row.phone.trim()).length,
      explicitlyOpen24x7: rows.filter((row) => row?.features?.open24x7 === true).length,
      cryptoFlexaPayTrue,
      cryptoFlexaPayFalse,
      cryptoFlexaPayMissing,
      cryptoCurrencyAcceptanceTrue,
      cryptoCurrencyAcceptanceFalse,
      cryptoCurrencyAcceptanceMissing,
      cryptoFlagCrossTab,
      stateCounts,
      statePageSizes,
      sampleKeys,
      featureKeys,
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});