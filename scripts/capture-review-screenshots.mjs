#!/usr/bin/env node

import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'artifacts', 'review-screenshots');
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const STAGING_PLACE_NAME = 'Staging Coffee Tokyo';
const REPORT_TARGET_ID = '10000000-0000-4000-8000-000000000001';

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
  ['place-detail', '/place/staging-coffee-tokyo'],
  ['service-detail', '/service/staging-vpn'],
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

COMMON_SCENARIOS.push(
  {
    id: 'report-payment',
    route: `/report?targetType=entity&targetId=${REPORT_TARGET_ID}`,
    action: 'prepare-report-form',
    fullPage: true,
  },
  {
    id: 'report-problem',
    route: `/report?targetType=entity&targetId=${REPORT_TARGET_ID}`,
    action: 'show-problem-report',
    fullPage: true,
  },
);

const DESKTOP_SCENARIOS = [
  {
    id: 'places-selected',
    route: '/places',
    action: 'select-place-desktop',
    fullPage: true,
  },
];

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
  {
    id: 'places-sheet-peek',
    route: '/places',
    action: 'select-place-mobile',
    fullPage: false,
  },
  {
    id: 'places-sheet-expanded',
    route: '/places',
    action: 'expand-place-sheet',
    fullPage: false,
  },
  {
    id: 'places-gallery-lightbox',
    route: '/places',
    action: 'open-place-gallery',
    fullPage: false,
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
  const loading = page.getByText('Loading map...', { exact: true });
  await loading.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
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

async function selectPlaceFromList(page) {
  await showPlacesList(page);
  await page
    .getByRole('button', { name: `Select ${STAGING_PLACE_NAME} on map`, exact: true })
    .click();
}

async function expandPlaceSheet(page) {
  await selectPlaceFromList(page);
  const peekSheet = page.locator('[data-sheet-state="peek"][data-sheet-entered="true"]');
  await peekSheet.waitFor({ state: 'visible' });
  const expandButton = page.getByRole('button', { name: 'Expand place details', exact: true });
  await expandButton.evaluate((button) => button.click());
  await page.locator('[data-sheet-state="expanded"]').waitFor({ state: 'visible' });
}

async function waitForReportForm(page) {
  await page
    .getByRole('heading', { name: 'What record are you reporting?', exact: true })
    .waitFor({ state: 'visible' });
  await page
    .getByText('Verification ready for screenshot review', { exact: true })
    .waitFor({ state: 'visible' });
}

async function runAction(page, action) {
  switch (action) {
    case 'none':
      return;
    case 'prepare-report-form':
      await waitForReportForm(page);
      break;
    case 'show-problem-report':
      await waitForReportForm(page);
      await page.getByLabel('Report type', { exact: true }).selectOption('problem_report');
      await page
        .getByRole('heading', {
          name: 'Describe the incorrect or problematic information',
          exact: true,
        })
        .waitFor({ state: 'visible' });
      break;
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
    case 'select-place-mobile':
      await selectPlaceFromList(page);
      await page
        .locator('[data-sheet-state="peek"][data-sheet-entered="true"]')
        .waitFor({ state: 'visible' });
      break;
    case 'expand-place-sheet':
      await expandPlaceSheet(page);
      break;
    case 'open-place-gallery': {
      await expandPlaceSheet(page);
      const imageButton = page.getByRole('button', { name: /Enlarge image 1 of/ }).first();
      await imageButton.evaluate((button) => button.click());
      await page.getByRole('dialog', { name: /Image viewer:/ }).waitFor({ state: 'visible' });
      break;
    }
    case 'select-place-desktop':
      await page
        .getByRole('button', { name: `Select ${STAGING_PLACE_NAME} on map`, exact: true })
        .click();
      await page
        .getByRole('complementary', { name: `Selected place details: ${STAGING_PLACE_NAME}` })
        .waitFor({ state: 'visible' });
      break;
    default:
      throw new Error(`Unknown screenshot action: ${action}`);
  }
  await settle(page, 1_500);
}

async function measurePage(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const sheet = document.querySelector('[data-sheet-state]');
    const map = document.querySelector('.maplibregl-canvas');
    const sheetRect = sheet?.getBoundingClientRect();
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
      placeSheetState: sheet?.getAttribute('data-sheet-state') ?? null,
      placeSheetRect: sheetRect
        ? {
            top: Math.round(sheetRect.top),
            bottom: Math.round(sheetRect.bottom),
            height: Math.round(sheetRect.height),
          }
        : null,
      placeSheetZIndex: sheet ? getComputedStyle(sheet).zIndex : null,
      mapRect: mapRect
        ? {
            top: Math.round(mapRect.top),
            bottom: Math.round(mapRect.bottom),
            height: Math.round(mapRect.height),
          }
        : null,
      mapZIndex: map ? getComputedStyle(map).zIndex : null,
      dialogOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
    };
  });
}

async function installReportScreenshotFixtures(page) {
  await page.route('**/api/reports/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        siteKey: '1x00000000000000000000AA',
        action: 'cpm_submission',
      }),
    });
  });

  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        window.turnstile = {
          render(container, options) {
            container.innerHTML = '<div style="min-height:64px;border:1px solid #cbd5e1;border-radius:10px;padding:16px;display:flex;align-items:center;background:#f8fafc;color:#334155;font:600 14px system-ui">Verification ready for screenshot review</div>';
            queueMicrotask(() => options.callback('screenshot-preview-token'));
            return 'cpm-screenshot-widget';
          },
          reset() {},
          remove() {},
        };
      `,
    });
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
  await installReportScreenshotFixtures(page);
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
