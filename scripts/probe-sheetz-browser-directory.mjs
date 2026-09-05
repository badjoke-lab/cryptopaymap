import { chromium } from 'playwright-core';

const PAGE_URL = 'https://orders.sheetz.com/findASheetz';
const API_PREFIX = 'https://orders.sheetz.com/anybff/api';
const PAGE_SIZE = 100;
const MAX_PAGES_PER_STATE = 20;

function fail(message) {
  throw new Error(message);
}

function stateCodes(payload) {
  const states = payload?.states;
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    fail(`Unexpected operating-states payload: ${JSON.stringify(payload)}`);
  }
  const entries = Object.entries(states);
  const keyCodes = entries.map(([key]) => key.trim().toUpperCase());
  if (keyCodes.length > 0 && keyCodes.every((code) => /^[A-Z]{2}$/.test(code))) {
    return keyCodes.sort();
  }
  fail(`Operating-states keys are not state codes: ${JSON.stringify(states)}`);
}

async function browserFetch(page, path, init = {}) {
  return page.evaluate(
    async ({ url, init }) => {
      const response = await fetch(url, {
        credentials: 'include',
        ...init,
        headers: {
          accept: 'application/json, text/plain, */*',
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        text: text.slice(0, 1000),
        data,
      };
    },
    { url: `${API_PREFIX}${path}`, init },
  );
}

async function main() {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) fail('CHROME_PATH is required.');

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();

    const stateResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/anybff/api/stores/getOperatingStates'),
      { timeout: 45_000 },
    );
    const navigation = await page.goto(PAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    if (!navigation || !navigation.ok()) {
      fail(`Locator navigation failed: ${navigation?.status() ?? 'no response'}`);
    }

    const liveStateResponse = await stateResponsePromise;
    const liveStateText = await liveStateResponse.text();
    if (!liveStateResponse.ok()) {
      fail(`Live locator state request failed ${liveStateResponse.status()}: ${liveStateText.slice(0, 500)}`);
    }
    const statesPayload = JSON.parse(liveStateText);
    const states = stateCodes(statesPayload);

    const rows = [];
    const stateCounts = {};
    for (const state of states) {
      let count = 0;
      for (let pageNumber = 0; pageNumber < MAX_PAGES_PER_STATE; pageNumber += 1) {
        const params = new URLSearchParams({
          stateCode: state,
          page: String(pageNumber),
          size: String(PAGE_SIZE),
        });
        const response = await browserFetch(page, `/stores/search?${params.toString()}`, {
          method: 'POST',
          body: '{}',
        });
        if (!response.ok) {
          fail(`Search failed ${state} page ${pageNumber}: HTTP ${response.status} ${response.text}`);
        }
        const stores = Array.isArray(response.data?.stores) ? response.data.stores : null;
        if (!stores) {
          fail(`Search payload missing stores for ${state} page ${pageNumber}: ${JSON.stringify(response.data)}`);
        }
        if (stores.length === 0) break;
        for (const store of stores) {
          const actualState = String(store?.state ?? '').trim().toUpperCase();
          if (actualState && actualState !== state) {
            fail(`State mismatch: requested ${state}, got ${actualState} store ${store?.storeNumber ?? '?'}`);
          }
          rows.push(store);
          count += 1;
        }
        if (stores.length < PAGE_SIZE) break;
        if (pageNumber === MAX_PAGES_PER_STATE - 1) {
          fail(`Pagination guard tripped for ${state}`);
        }
      }
      stateCounts[state] = count;
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
    const sampleKeys = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))].sort();

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
        stateCounts,
        sampleKeys,
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
