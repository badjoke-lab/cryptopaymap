// @ts-nocheck
import { createHash, createHmac } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_02';
const evidenceId = 'P6-02';
const expiryHours = 72;
const p601ReceiptPath = 'config/staging-authorization/p6-01-data-qa-receipt.json';
const defaultReviewBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const configuredAdminDomain = 'review.cryptopaymap-staging.pages.dev/admin';
const placeholderUuid = '00000000-0000-4000-8000-000000000000';
const protectedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const sensitiveResponseMarkers = [
  'cf-access-client-secret',
  'cf-access-jwt-assertion',
  'cf_authorization',
  'x-cpm-admin-signature',
  'database_url',
  'encryptedemail',
  'statussecret',
  'statustokenhash',
  'storagekey',
  'submissioncontact',
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readStatusJson(statusRoot, path) {
  const absolutePath = resolve(statusRoot, path);
  if (!existsSync(absolutePath)) return null;
  try {
    const value = readJson(absolutePath);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function boundedHash(value) {
  return `sha256:${sha256(typeof value === 'string' ? value : JSON.stringify(value))}`;
}

function validCommit(value) {
  return /^[a-f0-9]{40}$/.test(value);
}

function validOperator(value) {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function safeTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function p601Check(receipt, approvedCommit, evaluatedAt) {
  const generatedAt = safeTimestamp(receipt?.generatedAt);
  const expiresAt = safeTimestamp(receipt?.expiresAt);
  const binding = isObject(receipt?.binding) ? receipt.binding : null;
  const bindingKeys = ['releaseId', 'dataSnapshotId', 'configurationId', 'environmentId'];
  const bindingValid =
    binding !== null &&
    bindingKeys.every(
      (key) => typeof binding[key] === 'string' && /^sha256:[a-f0-9]{64}$/.test(binding[key]),
    );
  const current =
    receipt?.version === 1 &&
    receipt.evidenceId === 'P6-01' &&
    receipt.environment === 'configured_staging' &&
    receipt.state === 'accepted' &&
    receipt.commit === approvedCommit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > evaluatedAt.getTime() &&
    bindingValid;
  return {
    path: p601ReceiptPath,
    state: current
      ? 'current'
      : expiresAt && Date.parse(expiresAt) <= evaluatedAt.getTime()
        ? 'stale'
        : 'failed',
    generatedAt,
    expiresAt,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding[key]])) : null,
  };
}

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolutePath = join(root, entry);
    if (statSync(absolutePath).isDirectory()) files.push(...walkFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

function routePathFromFunction(functionsRoot, file) {
  const relativePath = relative(functionsRoot, file).split(sep).join('/');
  const withoutExtension = relativePath.replace(/\.(?:ts|js|mjs)$/, '');
  const segments = withoutExtension.split('/');
  if (segments.at(-1) === '_middleware') return null;
  if (segments.at(-1) === 'index') segments.pop();
  const normalized = segments.map((segment) => {
    const match = segment.match(/^\[{1,2}\.\.\.(.+?)\]{1,2}$/) ?? segment.match(/^\[(.+?)\]$/);
    return match ? placeholderUuid : segment;
  });
  return `/${normalized.join('/')}`.replace(/\/$/, '') || '/admin';
}

function methodsFromFunction(file) {
  const content = readFileSync(file, 'utf8');
  const methods = new Set();
  for (const method of protectedMethods) {
    const title = `${method[0]}${method.slice(1).toLowerCase()}`;
    if (new RegExp(`onRequest${title}\\b`).test(content)) methods.add(method);
  }
  if (methods.size === 0 && /\bonRequest\b/.test(content)) methods.add('GET');
  return [...methods].sort();
}

function buildRouteInventory(sourceRoot) {
  const functionsRoot = resolve(sourceRoot, 'functions');
  const adminRoot = resolve(functionsRoot, 'admin');
  if (!existsSync(adminRoot)) throw new Error('functions/admin is missing.');
  const routes = [];
  for (const file of walkFiles(adminRoot)) {
    if (!/\.(?:ts|js|mjs)$/.test(file)) continue;
    const path = routePathFromFunction(functionsRoot, file);
    if (!path) continue;
    const methods = methodsFromFunction(file);
    if (methods.length === 0) continue;
    routes.push({ path, methods });
  }
  routes.sort((left, right) => left.path.localeCompare(right.path));
  return routes;
}

function inspectControlPlane(credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return {
      status: 'failed',
      mode: 'derived_staging_service',
      externalControlPlaneRequired: false,
      error: 'missing_derived_service_credentials',
      missing,
    };
  }
  return {
    status: 'passed',
    mode: 'derived_staging_service',
    externalControlPlaneRequired: false,
    credentialSource: 'existing_review_seed_hkdf',
    roleCount: 2,
    roleDigest: boundedHash(['reviewer', 'publisher']),
  };
}

function safeLocationClass(location, baseUrl) {
  if (!location) return null;
  try {
    const target = new URL(location, baseUrl);
    if (target.hostname.endsWith('.cloudflareaccess.com')) return 'cloudflare_access';
    if (target.origin === baseUrl.origin) return 'same_origin';
    return 'external';
  } catch {
    return 'invalid';
  }
}

async function requestSummary(baseUrl, path, method, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    redirect: 'manual',
    body: method === 'GET' ? undefined : '{',
    cache: 'no-store',
  });
  const text = (await response.text()).slice(0, 8_192);
  const lower = text.toLowerCase();
  const forbiddenMarkers = sensitiveResponseMarkers.filter((marker) => lower.includes(marker));
  const cacheControl = response.headers.get('cache-control') ?? '';
  return {
    status: response.status,
    redirectClass: safeLocationClass(response.headers.get('location'), baseUrl),
    contentType: response.headers.get('content-type')?.split(';')[0] ?? null,
    cacheControlSafe: /(?:private|no-store|no-cache)/i.test(cacheControl),
    noPrivateLeakage: forbiddenMarkers.length === 0,
    responseDigest: sha256(text),
  };
}

function expectedUnauthenticated(method, summary) {
  if (
    method === 'GET' &&
    summary.redirectClass === 'cloudflare_access' &&
    [301, 302, 303, 307, 308].includes(summary.status)
  ) {
    return true;
  }
  return [401, 403].includes(summary.status);
}

async function inspectNegativeJourneys(baseUrl, routes) {
  const results = [];
  for (const route of routes) {
    for (const method of route.methods) {
      const unauthenticated = await requestSummary(baseUrl, route.path, method);
      const forgedEmail = await requestSummary(baseUrl, route.path, method, {
        'Cf-Access-Authenticated-User-Email': 'forged@example.invalid',
      });
      results.push({
        path: route.path,
        method,
        unauthenticated,
        forgedEmail,
        passed:
          expectedUnauthenticated(method, unauthenticated) &&
          expectedUnauthenticated(method, forgedEmail) &&
          unauthenticated.noPrivateLeakage &&
          forgedEmail.noPrivateLeakage,
      });
    }
  }
  return {
    status: results.length > 0 && results.every((result) => result.passed) ? 'passed' : 'failed',
    routeCount: routes.length,
    journeyCount: results.length * 2,
    routeInventoryDigest: boundedHash(routes),
    results,
  };
}

function serviceHeaders(role, keyBase64Url, path, method, extra = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = ['cryptopaymap-staging-admin-v1', role, timestamp, method, path].join('\n');
  const signature = createHmac('sha256', Buffer.from(keyBase64Url, 'base64url'))
    .update(message)
    .digest('base64url');
  return {
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': signature,
    ...extra,
  };
}

async function inspectPositiveJourneys(baseUrl, credentials) {
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    return { status: 'failed', error: 'missing_service_identity_credentials', missing };
  }
  const dashboardPath = '/admin/api/dashboard';
  const publicationPath = '/admin/api/export-activate';
  const reviewerDashboard = await requestSummary(
    baseUrl,
    dashboardPath,
    'GET',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, dashboardPath, 'GET'),
  );
  const reviewerPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('reviewer', credentials.reviewerKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
    }),
  );
  const publisherDashboard = await requestSummary(
    baseUrl,
    dashboardPath,
    'GET',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, dashboardPath, 'GET'),
  );
  const publisherPublication = await requestSummary(
    baseUrl,
    publicationPath,
    'POST',
    serviceHeaders('publisher', credentials.publisherKeyBase64Url, publicationPath, 'POST', {
      'Content-Type': 'application/json',
      'Idempotency-Key': '22222222-2222-4222-8222-222222222222',
    }),
  );
  const passed =
    reviewerDashboard.status === 200 &&
    reviewerDashboard.cacheControlSafe &&
    reviewerDashboard.noPrivateLeakage &&
    reviewerPublication.status === 403 &&
    reviewerPublication.cacheControlSafe &&
    publisherDashboard.status === 403 &&
    publisherDashboard.cacheControlSafe &&
    publisherPublication.status === 400 &&
    publisherPublication.cacheControlSafe &&
    publisherPublication.noPrivateLeakage;
  return {
    status: passed ? 'passed' : 'failed',
    reviewerDashboard,
    reviewerPublication,
    publisherDashboard,
    publisherPublication,
    identityDigests: {
      reviewer: boundedHash('staging-service:reviewer'),
      publisher: boundedHash('staging-service:publisher'),
    },
  };
}

export async function evaluateConfiguredStagingIdentityAdmin(input) {
  const now = input.now ?? new Date();
  if (input.confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!validCommit(input.approvedCommit) || !validCommit(input.currentMainCommit)) {
    throw new Error('Approved and current main commits must be exact lowercase 40-character SHAs.');
  }
  if (!validOperator(input.identityOwner)) {
    throw new Error('A bounded identity-operations owner is required.');
  }
  const baseUrl = new URL(input.reviewBaseUrl ?? defaultReviewBaseUrl);
  const p601 = p601Check(
    readStatusJson(input.statusRoot, p601ReceiptPath),
    input.approvedCommit,
    now,
  );
  let routeInventory = [];
  let routeInventoryError = null;
  try {
    routeInventory = buildRouteInventory(input.sourceRoot);
  } catch (error) {
    routeInventoryError =
      error instanceof Error ? error.message.slice(0, 120) : 'route_inventory_failed';
  }
  const controlPlane = inspectControlPlane(input.credentials);
  let negativeJourneys = { status: 'failed', error: 'route_inventory_unavailable' };
  if (routeInventory.length > 0) {
    try {
      negativeJourneys = await inspectNegativeJourneys(baseUrl, routeInventory);
    } catch (error) {
      negativeJourneys = {
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 120) : 'negative_journey_failed',
      };
    }
  }
  let positiveJourneys = { status: 'failed', error: 'positive_journey_unavailable' };
  try {
    positiveJourneys = await inspectPositiveJourneys(baseUrl, input.credentials);
  } catch (error) {
    positiveJourneys = {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 120) : 'positive_journey_failed',
    };
  }
  const blockers = [];
  if (input.approvedCommit !== input.currentMainCommit) blockers.push('exact_main:mismatch');
  if (input.repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  if (p601.state !== 'current') blockers.push(`P6-01:${p601.state}`);
  if (routeInventory.length === 0) blockers.push('protected_route_inventory:failed');
  if (controlPlane.status !== 'passed')
    blockers.push(`access_control_plane:${controlPlane.error ?? 'failed'}`);
  if (negativeJourneys.status !== 'passed') blockers.push('negative_journeys:failed');
  if (positiveJourneys.status !== 'passed')
    blockers.push(`positive_journeys:${positiveJourneys.error ?? 'failed'}`);
  blockers.sort();
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString();
  const accepted = blockers.length === 0 && p601.binding !== null;
  return {
    version: 1,
    evidenceId,
    launchDomain: 'identity_admin',
    environment: 'configured_staging',
    state: accepted ? 'accepted' : 'failed',
    commit: input.approvedCommit,
    generatedAt,
    expiresAt,
    workflowRunId: input.workflowRunId,
    owner: boundedHash(input.identityOwner.trim()),
    procedure: 'OPS-P6-001E configured staging identity and protected Admin evidence',
    checks: {
      exactMain: input.approvedCommit === input.currentMainCommit ? 'success' : 'failure',
      repositoryContract: input.repositoryContractOutcome,
      predecessor: {
        path: p601.path,
        state: p601.state,
        generatedAt: p601.generatedAt,
        expiresAt: p601.expiresAt,
      },
      routeInventory: {
        status: routeInventory.length > 0 ? 'passed' : 'failed',
        routeCount: routeInventory.length,
        digest: routeInventory.length > 0 ? boundedHash(routeInventory) : null,
        error: routeInventoryError,
      },
      controlPlane,
      negativeJourneys,
      positiveJourneys,
    },
    ...(p601.binding ? { binding: p601.binding } : {}),
    exceptions: blockers,
  };
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-ops-p6-001e-'));
  const statusRoot = join(root, 'status');
  const sourceRoot = join(root, 'source');
  const approvedCommit = 'a'.repeat(40);
  const now = new Date('2026-07-30T00:00:00.000Z');
  const binding = {
    releaseId: `sha256:${'1'.repeat(64)}`,
    dataSnapshotId: `sha256:${'2'.repeat(64)}`,
    configurationId: `sha256:${'3'.repeat(64)}`,
    environmentId: `sha256:${'4'.repeat(64)}`,
  };
  mkdirSync(resolve(statusRoot, dirname(p601ReceiptPath)), { recursive: true });
  writeFileSync(
    resolve(statusRoot, p601ReceiptPath),
    `${JSON.stringify({
      version: 1,
      evidenceId: 'P6-01',
      environment: 'configured_staging',
      state: 'accepted',
      commit: approvedCommit,
      generatedAt: '2026-07-29T23:00:00.000Z',
      expiresAt: '2026-08-01T00:00:00.000Z',
      binding,
    })}\n`,
  );
  mkdirSync(join(sourceRoot, 'functions/admin/api'), { recursive: true });
  writeFileSync(
    join(sourceRoot, 'functions/admin/index.ts'),
    'export const onRequestGet = async () => new Response();\n',
  );
  writeFileSync(
    join(sourceRoot, 'functions/admin/api/dashboard.ts'),
    'export const onRequestGet = async () => new Response();\n',
  );
  writeFileSync(
    join(sourceRoot, 'functions/admin/api/export-activate.ts'),
    'export const onRequestPost = async () => new Response();\n',
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.cloudflare.com') {
      if (url.pathname.endsWith('/access/organizations')) {
        return Response.json({
          success: true,
          result: { auth_domain: 'test.cloudflareaccess.com' },
        });
      }
      if (url.pathname.endsWith('/access/apps')) {
        return Response.json({
          success: true,
          result: [
            {
              id: 'app-id',
              type: 'self_hosted',
              domain: configuredAdminDomain,
              aud: 'a'.repeat(64),
              service_auth_401_redirect: true,
            },
          ],
        });
      }
      if (url.pathname.includes('/access/apps/app-id/policies')) {
        return Response.json({
          success: true,
          result: [{ id: 'policy-id', decision: 'non_identity', precedence: 1 }],
        });
      }
    }
    const headers = new Headers(init.headers);
    const role = headers.get('X-CPM-Admin-Role');
    const commonHeaders = {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json',
    };
    if (!role || headers.has('Cf-Access-Authenticated-User-Email')) {
      return new Response('{}', { status: 401, headers: commonHeaders });
    }
    if (role === 'reviewer') {
      if (url.pathname === '/admin/api/dashboard') {
        return new Response('{}', { status: 200, headers: commonHeaders });
      }
      return new Response('{}', { status: 403, headers: commonHeaders });
    }
    if (role === 'publisher') {
      if (url.pathname === '/admin/api/export-activate') {
        return new Response('{}', { status: 400, headers: commonHeaders });
      }
      return new Response('{}', { status: 403, headers: commonHeaders });
    }
    return new Response('{}', { status: 401, headers: commonHeaders });
  };
  try {
    const receipt = await evaluateConfiguredStagingIdentityAdmin({
      statusRoot,
      sourceRoot,
      approvedCommit,
      currentMainCommit: approvedCommit,
      confirmation: exactConfirmation,
      identityOwner: 'identity-owner',
      workflowRunId: 'self-test',
      repositoryContractOutcome: 'success',
      credentials: {
        reviewerKeyBase64Url: Buffer.alloc(32, 17).toString('base64url'),
        publisherKeyBase64Url: Buffer.alloc(32, 23).toString('base64url'),
      },
      now,
    });
    if (receipt.state !== 'accepted') {
      throw new Error(`valid configured identity fixture failed: ${receipt.exceptions.join(', ')}`);
    }
    const failed = await evaluateConfiguredStagingIdentityAdmin({
      statusRoot,
      sourceRoot,
      approvedCommit,
      currentMainCommit: approvedCommit,
      confirmation: exactConfirmation,
      identityOwner: 'identity-owner',
      workflowRunId: 'self-test',
      repositoryContractOutcome: 'success',
      credentials: {
        reviewerKeyBase64Url: '',
        publisherKeyBase64Url: '',
      },
      now,
    });
    if (failed.state !== 'failed' || failed.exceptions.length === 0) {
      throw new Error('missing configured identity inputs did not fail closed');
    }
    console.log('OPS-P6-001E configured staging identity/Admin self-test passed.');
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    await runSelfTest();
    return;
  }
  const [statusRoot, outputPath] = process.argv.slice(2);
  if (!statusRoot || !outputPath) {
    throw new Error('Usage: tsx script.ts <status-root> <output-path>');
  }
  const receipt = await evaluateConfiguredStagingIdentityAdmin({
    statusRoot,
    sourceRoot: process.env.SOURCE_ROOT ?? '.',
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    currentMainCommit: process.env.CURRENT_MAIN_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    identityOwner: process.env.IDENTITY_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failure',
    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
    credentials: {
      reviewerKeyBase64Url: process.env.CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL ?? '',
      publisherKeyBase64Url: process.env.CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL ?? '',
    },
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configured staging P6-02 state: ${receipt.state}`);
  if (receipt.exceptions.length > 0) console.log(`Exceptions: ${receipt.exceptions.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
