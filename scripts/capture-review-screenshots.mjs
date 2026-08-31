#!/usr/bin/env node

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'artifacts', 'review-screenshots');
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';

const DEVICES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
  },
  mobile: {
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  },
};

const COMMON_SCENARIOS = [
  ['home', '/'],
  ['places-default', '/places'],
  ['online-index', '/online'],
  ['stats', '/stats'],
  ['updates', '/updates'],
  ['about', '/about'],
  ['methodology', '/methodology'],
  ['sources-and-licenses', '/sources-and-licenses'],
  ['data', '/data'],
  ['roadmap', '/roadmap'],
  ['changelog', '/changelog'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
  ['disclaimer', '/disclaimer'],
  ['contact', '/contact'],
  ['support', '/support'],
  ['partners', '/partners'],
].map(([id, route]) => ({ id, route, action: 'none', fullPage: true }));

const DESKTOP_SCENARIOS = [];

const MOBILE_SCENARIOS = [
  {
    id: 'home-menu-open',
    route: '/',
    action: 'open-mobile-menu',
    fullPage: false,
  },
  {
    id: 'places-filters-open',
    route: '/places',
    action: 'open-filters',
    fullPage: false,
  },
  {
    id: 'places-list',
    route: '/places',
    action: 'show-list',
    fullPage: true,
  },
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function scenariosForDevice(deviceName) {
  return [
    ...COMMON_SCENARIOS,
    ...(deviceName === 'desktop' ? DESKTOP_SCENARIOS : MOBILE_SCENARIOS),
  ];
}

async function settle(page, delayMs = 1_000) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.waitForTimeout(delayMs);
}

async function waitForPlacesMap(page) {
  const loading = page.getByText('Loading map…', { exact: true });
  await loading.waitFor({ state: 'hidden', timeout: 20_000 });

  const loadError = page.getByText('Map could not be loaded', { exact: true });
  if (await loadError.isVisible().catch(() => false)) {
    throw new Error('Places map entered the load-error state.');
  }

  const unsupported = page.getByText('Interactive map unavailable', { exact: true });
  if (await unsupported.isVisible().catch(() => false)) {
    throw new Error('Places map entered the unsupported state.');
  }

  await page.locator('.maplibregl-canvas').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(1_500);
}

async function gotoScenario(page, baseUrl, route) {
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  if (!response || !response.ok()) {
    throw new Error(`HTTP ${response?.status() ?? 'no response'} for ${route}`);
  }
  await settle(page);
  if (route === '/places') await waitForPlacesMap(page);
}

async function showPlacesList(page) {
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('list', { name: 'Place results' }).waitFor({ state: 'visible' });
  await settle(page);
}

async function runAction(page, action) {
  switch (action) {
    case 'none':
      return;
    case 'open-mobile-menu':
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page
        .getByRole('complementary', { name: 'Mobile primary', exact: true })
        .waitFor({ state: 'visible' });
      break;
    case 'open-filters':
      await page.getByRole('button', { name: 'Filters', exact: true }).first().click();
      await page.getByLabel('Place filters').waitFor({ state: 'visible' });
      break;
    case 'show-list':
      await showPlacesList(page);
      break;
    default:
      throw new Error(`Unknown screenshot action: ${action}`);
  }
  await settle(page, 1_500);
}

async function measurePage(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const map = document.querySelector('.maplibregl-canvas');
    const mapRect = map?.getBoundingClientRect();
    return {
      title: document.title,
      h1Count: document.querySelectorAll('h1').length,
      mainCount: document.querySelectorAll('main').length,
      horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
      viewportWidth: root.clientWidth,
      viewportHeight: root.clientHeight,
      menuOpen:
        document.querySelector('#mobile-primary-menu')?.getAttribute('aria-hidden') === 'false',
      filterPanelOpen: Boolean(document.querySelector('[aria-label="Place filters"]')),
      mapRect: mapRect
        ? {
            top: Math.round(mapRect.top),
            bottom: Math.round(mapRect.bottom),
            height: Math.round(mapRect.height),
          }
        : null,
      mapZIndex: map ? getComputedStyle(map).zIndex : null,
    };
  });
}

async function captureDevice(browser, deviceName, baseUrl) {
  const device = DEVICES[deviceName];
  const outputDir = path.join(OUTPUT_ROOT, deviceName);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: 1,
    isMobile: device.isMobile ?? false,
    hasTouch: device.hasTouch ?? false,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const records = [];
  const failures = [];

  for (const scenario of scenariosForDevice(deviceName)) {
    const file = path.join(outputDir, `${scenario.id}.png`);
    try {
      await gotoScenario(page, baseUrl, scenario.route);
      await runAction(page, scenario.action);
      const metrics = await measurePage(page);
      await page.screenshot({
        path: file,
        fullPage: scenario.fullPage,
        animations: 'disabled',
      });
      records.push({
        id: scenario.id,
        route: scenario.route,
        action: scenario.action,
        fullPage: scenario.fullPage,
        file,
        screenshotBytes: (await stat(file)).size,
        metrics,
      });
      console.log(`[${deviceName}] captured ${scenario.id}`);
    } catch (error) {
      failures.push({
        id: scenario.id,
        route: scenario.route,
        action: scenario.action,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[${deviceName}] failed ${scenario.id}: ${failures.at(-1).error}`);
    }
  }

  await context.close();
  const manifest = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    baseUrl,
    device: deviceName,
    viewport: device.viewport,
    scenarioCount: records.length + failures.length,
    capturedCount: records.length,
    failedCount: failures.length,
    records,
    failures,
  };
  await writeFile(
    path.join(OUTPUT_ROOT, `manifest.${deviceName}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  if (failures.length > 0) {
    throw new Error(`${deviceName} screenshot capture failed for ${failures.length} scenario(s).`);
  }
}

async function main() {
  const baseUrl = argValue(
    'base-url',
    process.env.CPM_SCREENSHOT_BASE_URL ?? DEFAULT_BASE_URL,
  ).replace(/\/$/, '');
  const deviceName = argValue('device', 'all');
  const selectedDevices = deviceName === 'all' ? Object.keys(DEVICES) : [deviceName];
  for (const selected of selectedDevices) {
    if (!DEVICES[selected]) throw new Error(`Unsupported device: ${selected}`);
  }

  await mkdir(OUTPUT_ROOT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const selected of selectedDevices) {
      await captureDevice(browser, selected, baseUrl);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
