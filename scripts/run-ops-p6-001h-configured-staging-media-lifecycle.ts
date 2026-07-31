// @ts-nocheck
import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { mediaAssets, mediaFiles, mediaReviewDecisions } from '../src/db/schema';
import { deriveSuggestReviewSecrets } from './derive-suggest-review-secrets.mjs';

const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_04';
const evidenceId = 'P6-04';
const expiryHours = 72;
const defaultBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const predecessorPaths = [
  ['P6-01', 'config/staging-authorization/p6-01-data-qa-receipt.json'],
  ['P6-02', 'config/staging-authorization/p6-02-identity-admin-receipt.json'],
  ['P6-03', 'config/staging-authorization/p6-03-neon-transaction-receipt.json'],
] as const;
const fixture = Object.freeze({
  mediaAssetId: '94000000-0000-4000-8000-000000000001',
  displayFileId: '94000000-0000-4000-8000-000000000002',
  thumbnailFileId: '94000000-0000-4000-8000-000000000003',
  originalFileId: '94000000-0000-4000-8000-000000000004',
  submissionId: '94000000-0000-4000-8000-000000000005',
  approvalRequestId: '94000000-0000-4000-8000-000000000006',
  restrictionRequestId: '94000000-0000-4000-8000-000000000007',
  partialFailureFileId: '94000000-0000-4000-8000-000000000008',
});
const webpBytes = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v89WAAAAA==',
  'base64',
);
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const invalidBytes = Buffer.from('not-an-image', 'utf8');

function sha256(value: string | Uint8Array | unknown): string {
  const hash = createHash('sha256');
  if (typeof value === 'string' || value instanceof Uint8Array) hash.update(value);
  else hash.update(JSON.stringify(value));
  return hash.digest('hex');
}

function boundedHash(value: unknown): string {
  return `sha256:${sha256(value)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function validCommit(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
}

function validOperator(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 100;
}

function readPredecessor(
  statusRoot: string,
  evidenceId: string,
  path: string,
  commit: string,
  now: Date,
) {
  let receipt: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(readFileSync(resolve(statusRoot, path), 'utf8'));
    receipt = isObject(value) ? value : null;
  } catch {
    receipt = null;
  }
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
    receipt?.evidenceId === evidenceId &&
    receipt?.environment === 'configured_staging' &&
    receipt?.state === 'accepted' &&
    receipt?.commit === commit &&
    generatedAt !== null &&
    expiresAt !== null &&
    Date.parse(expiresAt) > now.getTime() &&
    bindingValid;
  return {
    evidenceId,
    path,
    state: current
      ? 'current'
      : expiresAt !== null && Date.parse(expiresAt) <= now.getTime()
        ? 'stale'
        : receipt === null
          ? 'missing'
          : 'failed',
    generatedAt,
    expiresAt,
    binding: current ? Object.fromEntries(bindingKeys.map((key) => [key, binding?.[key]])) : null,
  };
}

function sharedBinding(predecessors: ReturnType<typeof readPredecessor>[]) {
  if (predecessors.some((item) => item.state !== 'current' || item.binding === null)) return null;
  const first = JSON.stringify(predecessors[0]?.binding);
  return predecessors.every((item) => JSON.stringify(item.binding) === first)
    ? (predecessors[0]?.binding ?? null)
    : null;
}

function privateOriginalKey(hash: string): string {
  return `media/private/${fixture.mediaAssetId}/original-${hash}.png`;
}

function privateDerivativeKey(fileId: string, hash: string): string {
  return `media/private/${fixture.mediaAssetId}/${fileId}-${hash}.webp`;
}

function publicDerivativeKey(fileId: string, hash: string): string {
  return `media/public/${fixture.mediaAssetId}/${fileId}-${hash}.webp`;
}

function publicPath(fileId: string, hash: string): string {
  return `/media/staging/${fileId}-${hash}.webp`;
}

function signedHeaders(
  role: 'reviewer' | 'publisher',
  keyBase64Url: string,
  method: string,
  url: URL,
  timestampSeconds = Math.floor(Date.now() / 1000),
) {
  const timestamp = String(timestampSeconds);
  const message = [
    'cryptopaymap-staging-admin-v1',
    role,
    timestamp,
    method.toUpperCase(),
    `${url.pathname}${url.search}`,
  ].join('\n');
  return {
    'X-CPM-Admin-Role': role,
    'X-CPM-Admin-Timestamp': timestamp,
    'X-CPM-Admin-Signature': createHmac('sha256', Buffer.from(keyBase64Url, 'base64url'))
      .update(message)
      .digest('base64url'),
  };
}

async function requestSummary(url: URL, init: RequestInit, expectedBytes?: Uint8Array) {
  const response = await fetch(url, { ...init, redirect: 'manual', cache: 'no-store' });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes).slice(0, 8_192);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const cacheControl = response.headers.get('cache-control') ?? '';
  return {
    status: response.status,
    contentType: response.headers.get('content-type')?.split(';')[0] ?? null,
    cacheControlSafe: /(?:private|no-store|no-cache)/i.test(cacheControl),
    cacheControlPublic: /public/i.test(cacheControl),
    contentHashHeader: response.headers.get('x-cpm-content-hash'),
    width: response.headers.get('x-cpm-image-width'),
    height: response.headers.get('x-cpm-image-height'),
    bodyDigest: sha256(bytes),
    expectedBodyMatches:
      expectedBytes === undefined ? null : sha256(bytes) === sha256(expectedBytes),
    json,
    noPrivateLeakage: !/(database_url|secret|token|storagekey|signedurl|contact)/i.test(text),
  };
}

function objectUrl(baseUrl: URL, scope: 'private' | 'public', key: string) {
  const url = new URL('/admin/api/staging-media-object', baseUrl);
  url.searchParams.set('scope', scope);
  url.searchParams.set('key', key);
  return url;
}

async function cleanupDatabase(database: ReturnType<typeof createDatabase>) {
  await database
    .delete(mediaReviewDecisions)
    .where(eq(mediaReviewDecisions.mediaAssetId, fixture.mediaAssetId));
  await database.delete(mediaFiles).where(eq(mediaFiles.mediaAssetId, fixture.mediaAssetId));
  await database.delete(mediaAssets).where(eq(mediaAssets.id, fixture.mediaAssetId));
}

async function seedDatabase(
  database: ReturnType<typeof createDatabase>,
  seededAt: Date,
  hashes: {
    original: string;
    display: string;
    thumbnail: string;
  },
) {
  await database.insert(mediaAssets).values({
    id: fixture.mediaAssetId,
    purpose: 'public_gallery_candidate',
    role: 'gallery',
    reviewStatus: 'pending',
    rightsStatus: 'unknown',
    visibility: 'private',
    submissionId: fixture.submissionId,
    attribution: null,
    altText: null,
    rightsHolder: null,
    consentReference: null,
    displayOrder: 0,
    capturedAt: null,
    publishedAt: null,
    createdAt: seededAt,
    updatedAt: seededAt,
    deletedAt: null,
  });
  await database.insert(mediaFiles).values([
    {
      id: fixture.originalFileId,
      mediaAssetId: fixture.mediaAssetId,
      variant: 'original',
      storageScope: 'private',
      storageKey: privateOriginalKey(hashes.original),
      originalFilename: 'ops-p6-001h-fixture.png',
      mimeType: 'image/png',
      byteSize: pngBytes.byteLength,
      width: 1,
      height: 1,
      contentHash: hashes.original,
      createdAt: seededAt,
    },
    {
      id: fixture.displayFileId,
      mediaAssetId: fixture.mediaAssetId,
      variant: 'display',
      storageScope: 'private',
      storageKey: privateDerivativeKey(fixture.displayFileId, hashes.display),
      originalFilename: null,
      mimeType: 'image/webp',
      byteSize: webpBytes.byteLength,
      width: 1,
      height: 1,
      contentHash: hashes.display,
      createdAt: seededAt,
    },
    {
      id: fixture.thumbnailFileId,
      mediaAssetId: fixture.mediaAssetId,
      variant: 'thumbnail',
      storageScope: 'private',
      storageKey: privateDerivativeKey(fixture.thumbnailFileId, hashes.thumbnail),
      originalFilename: null,
      mimeType: 'image/webp',
      byteSize: webpBytes.byteLength,
      width: 1,
      height: 1,
      contentHash: hashes.thumbnail,
      createdAt: seededAt,
    },
  ]);
}

async function readDatabaseFixture(database: ReturnType<typeof createDatabase>) {
  const [assetRows, fileRows, decisionRows] = await Promise.all([
    database.select().from(mediaAssets).where(eq(mediaAssets.id, fixture.mediaAssetId)),
    database.select().from(mediaFiles).where(eq(mediaFiles.mediaAssetId, fixture.mediaAssetId)),
    database
      .select()
      .from(mediaReviewDecisions)
      .where(eq(mediaReviewDecisions.mediaAssetId, fixture.mediaAssetId)),
  ]);
  return { assetRows, fileRows, decisionRows };
}

function fileSnapshots(rows: Awaited<ReturnType<typeof readDatabaseFixture>>['fileRows']) {
  return rows
    .map((file) => ({
      id: file.id,
      variant: file.variant,
      storageScope: file.storageScope,
      storageKey: file.storageKey,
      mimeType: file.mimeType,
      contentHash: file.contentHash,
      width: file.width,
      height: file.height,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function decisionBody(
  state: Awaited<ReturnType<typeof readDatabaseFixture>>,
  action: 'approve_public' | 'restrict',
) {
  const asset = state.assetRows[0];
  if (!asset) throw new Error('Media fixture asset is missing.');
  const expectedFiles = fileSnapshots(state.fileRows);
  if (action === 'approve_public') {
    return {
      expectedMediaUpdatedAt: asset.updatedAt.toISOString(),
      expectedReviewStatus: 'pending',
      expectedPurpose: 'public_gallery_candidate',
      expectedRole: 'gallery',
      expectedRightsStatus: 'unknown',
      expectedVisibility: 'private',
      expectedSubject: { type: 'submission', id: fixture.submissionId },
      expectedFiles,
      action,
      targetMatch: 'confirmed',
      privacyReview: 'cleared',
      rightsDecision: {
        status: 'submitted_with_permission',
        licenseId: null,
        rightsHolder: 'Configured staging synthetic fixture',
        consentReference: 'ops-p6-001h-fixture',
        attribution: null,
        licenseAttributionRequired: false,
      },
      altText: 'Configured staging one-pixel Media lifecycle fixture.',
      displayOrder: 0,
      publicDisplayFileId: fixture.displayFileId,
      publicThumbnailFileId: fixture.thumbnailFileId,
      reasonCode: 'configured_staging_media_evidence',
      publicSummary: 'Configured staging Media lifecycle evidence fixture.',
      internalNote: null,
    };
  }
  return {
    expectedMediaUpdatedAt: asset.updatedAt.toISOString(),
    expectedReviewStatus: 'accepted',
    expectedPurpose: 'public_gallery',
    expectedRole: 'gallery',
    expectedRightsStatus: 'submitted_with_permission',
    expectedVisibility: 'public',
    expectedSubject: { type: 'submission', id: fixture.submissionId },
    expectedFiles,
    action,
    targetMatch: 'confirmed',
    privacyReview: 'cleared',
    rightsDecision: null,
    altText: null,
    displayOrder: null,
    publicDisplayFileId: null,
    publicThumbnailFileId: null,
    reasonCode: 'configured_staging_media_takedown',
    publicSummary: 'Configured staging Media fixture removed from public delivery.',
    internalNote: null,
  };
}

async function executeLifecycle(input: {
  databaseUrl: string;
  baseUrl: URL;
  reviewerKey: string;
  publisherKey: string;
  now: Date;
}) {
  const database = createDatabase(input.databaseUrl);
  const hashes = {
    original: sha256(pngBytes),
    display: sha256(webpBytes),
    thumbnail: sha256(webpBytes),
    invalid: sha256(invalidBytes),
  };
  const keys = {
    original: privateOriginalKey(hashes.original),
    displayPrivate: privateDerivativeKey(fixture.displayFileId, hashes.display),
    thumbnailPrivate: privateDerivativeKey(fixture.thumbnailFileId, hashes.thumbnail),
    displayPublic: publicDerivativeKey(fixture.displayFileId, hashes.display),
    thumbnailPublic: publicDerivativeKey(fixture.thumbnailFileId, hashes.thumbnail),
    partialPublic: publicDerivativeKey(fixture.partialFailureFileId, hashes.display),
  };
  const allObjectLocations = [
    ['private', keys.original],
    ['private', keys.displayPrivate],
    ['private', keys.thumbnailPrivate],
    ['public', keys.displayPublic],
    ['public', keys.thumbnailPublic],
    ['public', keys.partialPublic],
  ] as const;

  async function adminRequest(
    method: string,
    url: URL,
    role: 'reviewer' | 'publisher',
    key: string,
    body?: BodyInit,
    headers: Record<string, string> = {},
    timestamp?: number,
  ) {
    return requestSummary(url, {
      method,
      headers: {
        ...signedHeaders(role, key, method, url, timestamp),
        ...headers,
      },
      body,
    });
  }

  async function deleteObjects() {
    for (const [scope, key] of allObjectLocations) {
      const url = objectUrl(input.baseUrl, scope, key);
      try {
        await adminRequest('DELETE', url, 'reviewer', input.reviewerKey);
      } catch {
        // The final bounded cleanup outcome is checked separately.
      }
    }
  }

  await cleanupDatabase(database);
  await deleteObjects();
  let databaseCleanup = 'failed';
  let objectCleanup = 'failed';
  try {
    const originalUrl = objectUrl(input.baseUrl, 'private', keys.original);
    const unauthenticated = await requestSummary(originalUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-CPM-Content-Hash': hashes.original,
      },
      body: pngBytes,
    });
    const expired = await adminRequest(
      'PUT',
      originalUrl,
      'reviewer',
      input.reviewerKey,
      pngBytes,
      {
        'Content-Type': 'image/png',
        'X-CPM-Content-Hash': hashes.original,
      },
      Math.floor(input.now.getTime() / 1000) - 300,
    );
    const forgedEmail = await requestSummary(originalUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-CPM-Content-Hash': hashes.original,
        'Cf-Access-Authenticated-User-Email': 'forged@example.invalid',
      },
      body: pngBytes,
    });
    const invalidBytesResult = await adminRequest(
      'PUT',
      originalUrl,
      'reviewer',
      input.reviewerKey,
      invalidBytes,
      {
        'Content-Type': 'image/png',
        'X-CPM-Content-Hash': hashes.invalid,
      },
    );

    const originalUpload = await adminRequest(
      'PUT',
      originalUrl,
      'reviewer',
      input.reviewerKey,
      pngBytes,
      {
        'Content-Type': 'image/png',
        'X-CPM-Content-Hash': hashes.original,
      },
    );
    const displayUrl = objectUrl(input.baseUrl, 'private', keys.displayPrivate);
    const thumbnailUrl = objectUrl(input.baseUrl, 'private', keys.thumbnailPrivate);
    const displayUpload = await adminRequest(
      'PUT',
      displayUrl,
      'reviewer',
      input.reviewerKey,
      webpBytes,
      {
        'Content-Type': 'image/webp',
        'X-CPM-Content-Hash': hashes.display,
      },
    );
    const thumbnailUpload = await adminRequest(
      'PUT',
      thumbnailUrl,
      'reviewer',
      input.reviewerKey,
      webpBytes,
      {
        'Content-Type': 'image/webp',
        'X-CPM-Content-Hash': hashes.thumbnail,
      },
    );
    const privateOriginal = await adminRequest('GET', originalUrl, 'reviewer', input.reviewerKey);
    const publicBeforeApproval = await requestSummary(
      new URL(publicPath(fixture.displayFileId, hashes.display), input.baseUrl),
      { method: 'GET' },
    );
    const privateOriginalPublicAttempt = await requestSummary(
      new URL(`/media/staging/original-${hashes.original}.png`, input.baseUrl),
      { method: 'GET' },
    );

    const partialProbeUrl = new URL('/admin/api/staging-media-object', input.baseUrl);
    const partialFailure = await adminRequest(
      'POST',
      partialProbeUrl,
      'reviewer',
      input.reviewerKey,
      JSON.stringify({
        action: 'verify_partial_failure_cleanup',
        sourceKey: keys.displayPrivate,
        destinationKey: keys.partialPublic,
      }),
      { 'Content-Type': 'application/json' },
    );
    const partialPublicAfter = await requestSummary(
      new URL(publicPath(fixture.partialFailureFileId, hashes.display), input.baseUrl),
      { method: 'HEAD' },
    );

    const seededAt = new Date(input.now.getTime() - 60_000);
    await seedDatabase(database, seededAt, hashes);
    const seeded = await readDatabaseFixture(database);
    const approveBody = decisionBody(seeded, 'approve_public');
    const decisionUrl = new URL('/admin/api/media-decision', input.baseUrl);
    decisionUrl.searchParams.set('mediaAssetId', fixture.mediaAssetId);
    const approvalInit = () => ({
      method: 'POST',
      headers: {
        ...signedHeaders('reviewer', input.reviewerKey, 'POST', decisionUrl),
        'Content-Type': 'application/json',
        'Idempotency-Key': fixture.approvalRequestId,
      },
      body: JSON.stringify(approveBody),
    });
    const concurrentApprovalResponses = await Promise.all([
      requestSummary(decisionUrl, approvalInit()),
      requestSummary(decisionUrl, approvalInit()),
    ]);
    const approvalStates = concurrentApprovalResponses
      .map((result) => (isObject(result.json) ? result.json.state : null))
      .sort();
    const approvedState = await readDatabaseFixture(database);
    const changedApproval = await requestSummary(decisionUrl, {
      ...approvalInit(),
      body: JSON.stringify({ ...approveBody, altText: 'Changed replay content.' }),
    });
    const publisherDenied = await requestSummary(decisionUrl, {
      method: 'POST',
      headers: {
        ...signedHeaders('publisher', input.publisherKey, 'POST', decisionUrl),
        'Content-Type': 'application/json',
        'Idempotency-Key': '94000000-0000-4000-8000-000000000099',
      },
      body: JSON.stringify(approveBody),
    });

    const publicDisplay = await requestSummary(
      new URL(publicPath(fixture.displayFileId, hashes.display), input.baseUrl),
      { method: 'GET' },
      webpBytes,
    );
    const publicThumbnail = await requestSummary(
      new URL(publicPath(fixture.thumbnailFileId, hashes.thumbnail), input.baseUrl),
      { method: 'GET' },
      webpBytes,
    );

    const restrictBody = decisionBody(approvedState, 'restrict');
    const restrictionUrl = new URL('/admin/api/media-decision', input.baseUrl);
    restrictionUrl.searchParams.set('mediaAssetId', fixture.mediaAssetId);
    const restriction = await requestSummary(restrictionUrl, {
      method: 'POST',
      headers: {
        ...signedHeaders('reviewer', input.reviewerKey, 'POST', restrictionUrl),
        'Content-Type': 'application/json',
        'Idempotency-Key': fixture.restrictionRequestId,
      },
      body: JSON.stringify(restrictBody),
    });
    const restrictedState = await readDatabaseFixture(database);
    const publicDisplayAfterTakedown = await requestSummary(
      new URL(publicPath(fixture.displayFileId, hashes.display), input.baseUrl),
      { method: 'GET' },
    );
    const publicThumbnailAfterTakedown = await requestSummary(
      new URL(publicPath(fixture.thumbnailFileId, hashes.thumbnail), input.baseUrl),
      { method: 'GET' },
    );

    await deleteObjects();
    const deletedHeads = [];
    for (const [scope, key] of allObjectLocations) {
      deletedHeads.push(
        await adminRequest(
          'HEAD',
          objectUrl(input.baseUrl, scope, key),
          'reviewer',
          input.reviewerKey,
        ),
      );
    }
    objectCleanup = deletedHeads.every((result) => result.status === 404) ? 'passed' : 'failed';
    await cleanupDatabase(database);
    const cleaned = await readDatabaseFixture(database);
    databaseCleanup =
      cleaned.assetRows.length === 0 &&
      cleaned.fileRows.length === 0 &&
      cleaned.decisionRows.length === 0
        ? 'passed'
        : 'failed';

    const approvalPassed =
      concurrentApprovalResponses.every((result) => result.status === 200) &&
      JSON.stringify(approvalStates) === JSON.stringify(['committed', 'replayed']) &&
      approvedState.assetRows[0]?.visibility === 'public' &&
      approvedState.assetRows[0]?.reviewStatus === 'accepted' &&
      approvedState.decisionRows.length === 1;
    const restrictionPassed =
      restriction.status === 200 &&
      restrictedState.assetRows[0]?.visibility === 'restricted' &&
      restrictedState.decisionRows.length === 2 &&
      publicDisplayAfterTakedown.status === 404 &&
      publicThumbnailAfterTakedown.status === 404;

    return {
      mode: 'durable_object_staging_media',
      uploadAuthorization: {
        status:
          unauthenticated.status === 403 && expired.status === 403 && forgedEmail.status === 403
            ? 'passed'
            : 'failed',
        methodAndPathBound: true,
        maximumClockSkewSeconds: 90,
        unauthenticatedStatus: unauthenticated.status,
        expiredStatus: expired.status,
        forgedEmailStatus: forgedEmail.status,
      },
      byteInspection: {
        status:
          invalidBytesResult.status === 415 &&
          originalUpload.status === 201 &&
          displayUpload.status === 201 &&
          thumbnailUpload.status === 201
            ? 'passed'
            : 'failed',
        disguisedBytesStatus: invalidBytesResult.status,
        original: { mimeType: 'image/png', byteSize: pngBytes.byteLength, width: 1, height: 1 },
        display: { mimeType: 'image/webp', byteSize: webpBytes.byteLength, width: 1, height: 1 },
        thumbnail: { mimeType: 'image/webp', byteSize: webpBytes.byteLength, width: 1, height: 1 },
        deterministicDerivativeDigest: boundedHash({
          display: hashes.display,
          thumbnail: hashes.thumbnail,
        }),
      },
      privateOriginal: {
        status:
          privateOriginal.status === 200 &&
          privateOriginal.cacheControlSafe &&
          privateOriginalPublicAttempt.status === 404 &&
          publicBeforeApproval.status === 404
            ? 'passed'
            : 'failed',
        privateReadStatus: privateOriginal.status,
        publicOriginalStatus: privateOriginalPublicAttempt.status,
        publicDerivativeBeforeApprovalStatus: publicBeforeApproval.status,
      },
      partialFailure: {
        status:
          partialFailure.status === 200 &&
          isObject(partialFailure.json) &&
          partialFailure.json.injectedFailureObserved === true &&
          partialFailure.json.cleanupSucceeded === true &&
          partialFailure.json.externallyUnavailableAfterCleanup === true &&
          partialPublicAfter.status === 404
            ? 'passed'
            : 'failed',
        probeStatus: partialFailure.status,
        externalStatusAfterCleanup: partialPublicAfter.status,
      },
      approval: {
        status: approvalPassed ? 'passed' : 'failed',
        responseStates: approvalStates,
        decisionCount: approvedState.decisionRows.length,
        publicVisibility: approvedState.assetRows[0]?.visibility ?? null,
      },
      replayAndCapability: {
        status:
          approvalPassed && changedApproval.status === 409 && publisherDenied.status === 403
            ? 'passed'
            : 'failed',
        exactReplayStates: approvalStates,
        changedContentStatus: changedApproval.status,
        publisherStatus: publisherDenied.status,
      },
      publicDelivery: {
        status:
          publicDisplay.status === 200 &&
          publicDisplay.expectedBodyMatches === true &&
          publicDisplay.cacheControlPublic &&
          publicThumbnail.status === 200 &&
          publicThumbnail.expectedBodyMatches === true &&
          publicThumbnail.cacheControlPublic
            ? 'passed'
            : 'failed',
        displayStatus: publicDisplay.status,
        thumbnailStatus: publicThumbnail.status,
        displayDigest: publicDisplay.bodyDigest,
        thumbnailDigest: publicThumbnail.bodyDigest,
      },
      takedown: {
        status: restrictionPassed ? 'passed' : 'failed',
        restrictionStatus: restriction.status,
        visibility: restrictedState.assetRows[0]?.visibility ?? null,
        displayStatusAfterTakedown: publicDisplayAfterTakedown.status,
        thumbnailStatusAfterTakedown: publicThumbnailAfterTakedown.status,
      },
      cleanup: {
        status: objectCleanup === 'passed' && databaseCleanup === 'passed' ? 'passed' : 'failed',
        objects: objectCleanup,
        database: databaseCleanup,
      },
      retainedDigests: {
        fixtureIdentity: boundedHash(fixture),
        objectKeys: boundedHash(Object.values(keys)),
        approvalReceipt: boundedHash(approvedState.decisionRows[0] ?? null),
        restrictionReceipt: boundedHash(restrictedState.decisionRows[1] ?? null),
      },
    };
  } finally {
    if (objectCleanup !== 'passed') await deleteObjects();
    if (databaseCleanup !== 'passed') await cleanupDatabase(database);
  }
}

export async function evaluateConfiguredStagingMediaLifecycle(input: {
  statusRoot: string;
  approvedCommit: string;
  currentMainCommit: string;
  confirmation: string;
  mediaOwner: string;
  workflowRunId: string | null;
  repositoryContractOutcome: string;
  databaseUrl: string;
  reviewSeed: string;
  reviewBaseUrl?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.confirmation !== exactConfirmation) {
    throw new Error(`Exact confirmation ${exactConfirmation} is required.`);
  }
  if (!validCommit(input.approvedCommit) || !validCommit(input.currentMainCommit)) {
    throw new Error('Approved and current main commits must be exact lowercase 40-character SHAs.');
  }
  if (!validOperator(input.mediaOwner)) throw new Error('A bounded Media owner is required.');

  const predecessors = predecessorPaths.map(([evidence, path]) =>
    readPredecessor(input.statusRoot, evidence, path, input.approvedCommit, now),
  );
  const binding = sharedBinding(predecessors);
  const blockers: string[] = [];
  if (input.approvedCommit !== input.currentMainCommit) blockers.push('exact_main:mismatch');
  if (input.repositoryContractOutcome !== 'success') blockers.push('repository_contract:failed');
  for (const predecessor of predecessors) {
    if (predecessor.state !== 'current')
      blockers.push(`${predecessor.evidenceId}:${predecessor.state}`);
  }
  if (binding === null) blockers.push('predecessor_binding:mismatch');
  if (!input.databaseUrl) blockers.push('database:missing');
  if (!input.reviewSeed) blockers.push('review_seed:missing');

  let checks: Record<string, unknown> = {
    mode: 'durable_object_staging_media',
    uploadAuthorization: { status: 'not_run' },
    byteInspection: { status: 'not_run' },
    privateOriginal: { status: 'not_run' },
    partialFailure: { status: 'not_run' },
    approval: { status: 'not_run' },
    replayAndCapability: { status: 'not_run' },
    publicDelivery: { status: 'not_run' },
    takedown: { status: 'not_run' },
    cleanup: { status: 'not_run' },
  };
  if (blockers.length === 0) {
    try {
      const derived = deriveSuggestReviewSecrets(input.reviewSeed);
      checks = await executeLifecycle({
        databaseUrl: input.databaseUrl,
        baseUrl: new URL(input.reviewBaseUrl ?? defaultBaseUrl),
        reviewerKey: derived.CPM_STAGING_ADMIN_REVIEWER_HMAC_KEY_BASE64URL,
        publisherKey: derived.CPM_STAGING_ADMIN_PUBLISHER_HMAC_KEY_BASE64URL,
        now,
      });
    } catch {
      blockers.push('configured_media_lifecycle:failed');
    }
  }
  for (const key of [
    'uploadAuthorization',
    'byteInspection',
    'privateOriginal',
    'partialFailure',
    'approval',
    'replayAndCapability',
    'publicDelivery',
    'takedown',
    'cleanup',
  ]) {
    if ((checks[key] as Record<string, unknown> | undefined)?.status !== 'passed') {
      blockers.push(`${key}:failed`);
    }
  }
  blockers.sort();
  const generatedAt = now.toISOString();
  return {
    version: 1,
    evidenceId,
    launchDomain: 'media_lifecycle',
    environment: 'configured_staging',
    state: blockers.length === 0 && binding !== null ? 'accepted' : 'failed',
    commit: input.approvedCommit,
    generatedAt,
    expiresAt: new Date(now.getTime() + expiryHours * 60 * 60 * 1_000).toISOString(),
    workflowRunId: input.workflowRunId,
    owner: boundedHash(input.mediaOwner.trim()),
    procedure: 'OPS-P6-001H configured staging Media lifecycle evidence',
    checks: {
      exactMain: input.approvedCommit === input.currentMainCommit ? 'success' : 'failure',
      repositoryContract: input.repositoryContractOutcome,
      predecessors: predecessors.map(({ binding: _binding, ...predecessor }) => predecessor),
      ...checks,
    },
    ...(binding ? { binding } : {}),
    exceptions: [...new Set(blockers)],
  };
}

async function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'cpm-ops-p6-001h-'));
  const commit = 'a'.repeat(40);
  const now = new Date('2026-07-31T00:00:00.000Z');
  const binding = {
    releaseId: `sha256:${'1'.repeat(64)}`,
    dataSnapshotId: `sha256:${'2'.repeat(64)}`,
    configurationId: `sha256:${'3'.repeat(64)}`,
    environmentId: `sha256:${'4'.repeat(64)}`,
  };
  try {
    for (const [evidence, path] of predecessorPaths) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        `${JSON.stringify({
          version: 1,
          evidenceId: evidence,
          environment: 'configured_staging',
          state: 'accepted',
          commit,
          generatedAt: '2026-07-30T23:00:00.000Z',
          expiresAt: '2026-08-02T00:00:00.000Z',
          binding,
        })}\n`,
      );
    }
    const predecessors = predecessorPaths.map(([evidence, path]) =>
      readPredecessor(root, evidence, path, commit, now),
    );
    if (
      predecessors.some((item) => item.state !== 'current') ||
      sharedBinding(predecessors) === null
    ) {
      throw new Error('valid predecessor fixtures were not accepted');
    }
    if (sha256(webpBytes).length !== 64 || sha256(pngBytes).length !== 64) {
      throw new Error('fixture digests are invalid');
    }
    const retained = JSON.stringify({ fixture: boundedHash(fixture), binding });
    if (/(postgresql:\/\/|secret|signedurl|storagekey)/i.test(retained)) {
      throw new Error('self-test retained evidence contains forbidden material');
    }
    console.log('OPS-P6-001H configured staging Media lifecycle self-test passed.');
  } finally {
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
  const receipt = await evaluateConfiguredStagingMediaLifecycle({
    statusRoot,
    approvedCommit: process.env.APPROVED_COMMIT ?? '',
    currentMainCommit: process.env.CURRENT_MAIN_COMMIT ?? '',
    confirmation: process.env.CONFIRMATION ?? '',
    mediaOwner: process.env.MEDIA_OWNER ?? '',
    workflowRunId: process.env.WORKFLOW_RUN_ID ?? null,
    repositoryContractOutcome: process.env.REPOSITORY_CONTRACT_OUTCOME ?? 'failure',
    databaseUrl: process.env.DATABASE_URL ?? '',
    reviewSeed: process.env.CPM_REVIEW_SECRET_SEED_BASE64URL ?? '',
    reviewBaseUrl: process.env.CPM_REVIEW_BASE_URL,
  });
  mkdirSync(dirname(resolve(outputPath)), { recursive: true });
  writeFileSync(resolve(outputPath), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`Configured staging P6-04 state: ${receipt.state}`);
  if (receipt.exceptions.length > 0) console.log(`Exceptions: ${receipt.exceptions.join(', ')}`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
