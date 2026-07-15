import { createHash, createHmac, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { buildPhotoDirectUploadAuditResult } from '../src/submissions/photo-direct-upload-audit';

const defaultBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const baseUrl = new URL(process.env.CPM_P5_05I_REVIEW_URL ?? defaultBaseUrl);
const databaseUrl = process.env.DATABASE_URL;
const r2AccountId = process.env.CPM_PHOTO_R2_ACCOUNT_ID;
const r2AccessKeyId = process.env.CPM_PHOTO_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.CPM_PHOTO_R2_SECRET_ACCESS_KEY;
const r2Bucket = process.env.CPM_PHOTO_R2_QUARANTINE_BUCKET;
const expectedSiteKey = process.env.CPM_P5_05I_EXPECTED_SITE_KEY ?? '1x00000000000000000000AA';
const expectedAction = process.env.CPM_P5_05I_EXPECTED_ACTION ?? 'submission_intake';
const challengeToken = 'XXXX.DUMMY.TOKEN.XXXX';
const publicArtifactPaths = ['/data/manifest.json', '/version.json'];
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0LsAAAAASUVORK5CYII=',
  'base64',
);
const emptyPayloadHash = createHash('sha256').update(Buffer.alloc(0)).digest('hex');

interface UploadReceipt {
  schemaVersion: 'photo-upload-authorization-receipt-v1';
  state: 'committed' | 'replayed';
  intakeRequestId: string;
  expiresAt: string;
  uploads: Array<{
    quarantineUploadId: string;
    method: 'PUT';
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
    declaredByteSize: number;
  }>;
}

interface PrivateReceipt {
  submissionReference: string;
  statusSecret: string;
  submittedAt: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function signingKey(secret: string, dateStamp: string): Buffer {
  const date = hmac(`AWS4${secret}`, dateStamp);
  const region = hmac(date, 'auto');
  const service = hmac(region, 's3');
  return hmac(service, 'aws4_request');
}

function amzTimestamp(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function signedS3Headers(method: 'HEAD' | 'DELETE', url: URL, now: Date): Headers {
  if (!r2AccessKeyId || !r2SecretAccessKey) throw new Error('audit_configuration');
  const timestamp = amzTimestamp(now);
  const dateStamp = timestamp.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalHeaders = [
    `host:${url.host}`,
    `x-amz-content-sha256:${emptyPayloadHash}`,
    `x-amz-date:${timestamp}`,
    '',
  ].join('\n');
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    emptyPayloadHash,
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    scope,
    sha256(Buffer.from(canonicalRequest)),
  ].join('\n');
  const signature = hmac(signingKey(r2SecretAccessKey, dateStamp), stringToSign).toString('hex');

  return new Headers({
    Authorization: `AWS4-HMAC-SHA256 Credential=${r2AccessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': emptyPayloadHash,
    'x-amz-date': timestamp,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrivateReceipt(value: unknown): value is PrivateReceipt {
  return (
    isObject(value) &&
    typeof value.submissionReference === 'string' &&
    typeof value.statusSecret === 'string' &&
    typeof value.submittedAt === 'string' &&
    Object.keys(value).length === 3
  );
}

function isUploadReceipt(value: unknown, requestId: string): value is UploadReceipt {
  if (
    !isObject(value) ||
    value.schemaVersion !== 'photo-upload-authorization-receipt-v1' ||
    !['committed', 'replayed'].includes(String(value.state)) ||
    value.intakeRequestId !== requestId ||
    typeof value.expiresAt !== 'string' ||
    !Array.isArray(value.uploads) ||
    value.uploads.length !== 1
  ) {
    return false;
  }
  const upload = value.uploads[0];
  return (
    isObject(upload) &&
    typeof upload.quarantineUploadId === 'string' &&
    upload.method === 'PUT' &&
    typeof upload.uploadUrl === 'string' &&
    isObject(upload.requiredHeaders) &&
    Object.values(upload.requiredHeaders).every((header) => typeof header === 'string') &&
    upload.declaredByteSize === syntheticPng.byteLength
  );
}

function cspMatches(value: string | null): boolean {
  return (
    value?.includes('https://challenges.cloudflare.com') === true &&
    value.includes('https://*.r2.cloudflarestorage.com') &&
    value.includes("form-action 'self'") &&
    value.includes("frame-ancestors 'none'")
  );
}

function commaValues(value: string | null): string[] {
  return (
    value
      ?.split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readPublicArtifacts(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      publicArtifactPaths.map(async (path) => {
        const response = await fetch(new URL(path, baseUrl), { cache: 'no-store' });
        if (!response.ok) throw new Error('public_artifact_unavailable');
        return [path, sha256(Buffer.from(await response.arrayBuffer()))];
      }),
    ),
  );
}

async function verifyDatabaseProjection(
  submissionReference: string | null,
  targetId: string,
  reservationId: string | null,
): Promise<{ projectionMatches: boolean; automaticMediaAbsent: boolean }> {
  if (!databaseUrl || submissionReference === null || reservationId === null) {
    return { projectionMatches: false, automaticMediaAbsent: false };
  }
  const sql = neon(databaseUrl);
  const rows = await sql`
    select
      s.id,
      s.submission_type,
      s.target_type,
      s.target_id,
      s.workflow_status,
      p.normalized_payload,
      exists (
        select 1
        from submission_events e
        where e.submission_id = s.id
          and e.action = 'photo_media_handoff_created'
      ) as has_media_handoff
    from submissions s
    join submission_payloads p on p.submission_id = s.id
    where s.public_id = ${submissionReference}
    limit 1
  `;
  const row = rows[0];
  const media = row?.normalized_payload?.media;
  const projectionMatches =
    row?.submission_type === 'photos' &&
    row?.target_type === 'entity' &&
    row?.target_id === targetId &&
    row?.workflow_status === 'received' &&
    Array.isArray(media) &&
    media.length === 1 &&
    media[0]?.quarantineUploadId === reservationId &&
    media[0]?.purpose === 'public_gallery_candidate';
  return {
    projectionMatches,
    automaticMediaAbsent: row !== undefined && row.has_media_handoff === false,
  };
}

async function main() {
  if (!databaseUrl || !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    throw new Error('audit_configuration');
  }

  const requestId = randomUUID();
  const targetId = randomUUID();
  const artifactsBefore = await readPublicArtifacts();
  const checks = {
    clientConfigurationHttpStatus: 0,
    clientConfigurationMatches: false,
    photosPageHttpStatus: 0,
    photosPageHeadersMatch: false,
    authorizationHttpStatus: 0,
    authorizationReceiptValid: false,
    authorizationPrivateScopeMatches: false,
    corsPreflightHttpStatus: 0,
    corsPolicyMatches: false,
    directPutHttpStatus: 0,
    objectHeadHttpStatus: 0,
    storedObjectMatches: false,
    privateIntakeHttpStatus: 0,
    privateIntakeReceiptValid: false,
    databaseProjectionMatches: false,
    automaticMediaAbsent: false,
    publicArtifactsUnchanged: Object.fromEntries(publicArtifactPaths.map((path) => [path, false])),
    cleanupDeleteHttpStatus: 0,
    cleanupHeadHttpStatus: 0,
    cleanupConfirmed: false,
  };

  let uploadReceipt: UploadReceipt | null = null;
  let objectUrl: URL | null = null;
  let privateReceipt: PrivateReceipt | null = null;

  try {
    const configurationResponse = await fetch(new URL('/api/photos/config', baseUrl), {
      cache: 'no-store',
    });
    const configuration = await readJson(configurationResponse);
    checks.clientConfigurationHttpStatus = configurationResponse.status;
    checks.clientConfigurationMatches =
      isObject(configuration) &&
      configuration.siteKey === expectedSiteKey &&
      configuration.action === expectedAction &&
      Object.keys(configuration).length === 2;

    const pageResponse = await fetch(new URL('/photos', baseUrl), { cache: 'no-store' });
    checks.photosPageHttpStatus = pageResponse.status;
    checks.photosPageHeadersMatch =
      pageResponse.status === 200 &&
      pageResponse.headers.get('cache-control')?.includes('no-store') === true &&
      pageResponse.headers.get('referrer-policy') === 'no-referrer' &&
      cspMatches(pageResponse.headers.get('content-security-policy'));

    const authorizationResponse = await fetch(
      new URL('/api/photos/upload-authorizations', baseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId,
        },
        body: JSON.stringify({
          challengeToken,
          authorization: {
            schemaVersion: 'photo-upload-authorization-v1',
            intakeRequestId: requestId,
            targetType: 'entity',
            targetId,
            media: [
              {
                purpose: 'public_gallery_candidate',
                declaredMimeType: 'image/png',
                declaredByteSize: syntheticPng.byteLength,
              },
            ],
          },
        }),
      },
    );
    checks.authorizationHttpStatus = authorizationResponse.status;
    const authorizationPayload = await readJson(authorizationResponse);
    checks.authorizationReceiptValid = isUploadReceipt(authorizationPayload, requestId);
    if (checks.authorizationReceiptValid) uploadReceipt = authorizationPayload as UploadReceipt;

    const upload = uploadReceipt?.uploads[0];
    if (upload !== undefined) {
      const parsedUrl = new URL(upload.uploadUrl);
      objectUrl = new URL(parsedUrl.origin + parsedUrl.pathname);
      const expectedPathPrefix = `/${r2Bucket}/quarantine/photos/v1/`;
      checks.authorizationPrivateScopeMatches =
        parsedUrl.protocol === 'https:' &&
        parsedUrl.hostname === `${r2AccountId}.r2.cloudflarestorage.com` &&
        parsedUrl.pathname.startsWith(expectedPathPrefix) &&
        parsedUrl.pathname.endsWith(upload.quarantineUploadId) &&
        upload.requiredHeaders['content-type'] === 'image/png' &&
        upload.requiredHeaders['x-amz-content-sha256'] === 'UNSIGNED-PAYLOAD' &&
        upload.requiredHeaders['x-amz-meta-cpm-reservation-id'] === upload.quarantineUploadId &&
        upload.requiredHeaders['x-amz-meta-cpm-intake-request-id'] === requestId &&
        upload.requiredHeaders['x-amz-meta-cpm-target-id'] === targetId &&
        upload.requiredHeaders['x-amz-meta-cpm-declared-byte-size'] ===
          String(syntheticPng.byteLength);

      const requestedHeaders = Object.keys(upload.requiredHeaders)
        .map((name) => name.toLowerCase())
        .sort();
      const preflightResponse = await fetch(upload.uploadUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: baseUrl.origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': requestedHeaders.join(','),
        },
      });
      checks.corsPreflightHttpStatus = preflightResponse.status;
      const allowedMethods = commaValues(
        preflightResponse.headers.get('access-control-allow-methods'),
      );
      const allowedHeaders = commaValues(
        preflightResponse.headers.get('access-control-allow-headers'),
      );
      checks.corsPolicyMatches =
        preflightResponse.headers.get('access-control-allow-origin') === baseUrl.origin &&
        allowedMethods.includes('put') &&
        requestedHeaders.every(
          (header) => allowedHeaders.includes(header) || allowedHeaders.includes('*'),
        );

      const putResponse = await fetch(upload.uploadUrl, {
        method: upload.method,
        headers: {
          ...upload.requiredHeaders,
          Origin: baseUrl.origin,
        },
        body: syntheticPng,
      });
      checks.directPutHttpStatus = putResponse.status;

      const headResponse = await fetch(objectUrl, {
        method: 'HEAD',
        headers: signedS3Headers('HEAD', objectUrl, new Date()),
      });
      checks.objectHeadHttpStatus = headResponse.status;
      checks.storedObjectMatches =
        headResponse.status === 200 &&
        headResponse.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase() === 'image/png' &&
        Number(headResponse.headers.get('content-length')) === syntheticPng.byteLength &&
        headResponse.headers.get('x-amz-meta-cpm-reservation-id') === upload.quarantineUploadId &&
        headResponse.headers.get('x-amz-meta-cpm-intake-request-id') === requestId &&
        headResponse.headers.get('x-amz-meta-cpm-target-id') === targetId;

      const intakeResponse = await fetch(new URL('/api/photos', baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestId,
        },
        body: JSON.stringify({
          challengeToken,
          submission: {
            schemaVersion: 'submission-common-v1',
            submissionType: 'photos',
            targetType: 'entity',
            targetId,
            relationship: 'independent_researcher',
            contact: null,
            evidenceLinks: [],
            originalPayload: {
              schemaVersion: 'photo-media-v1',
              media: [
                {
                  quarantineUploadId: upload.quarantineUploadId,
                  purpose: 'public_gallery_candidate',
                  role: 'gallery',
                  declaredMimeType: 'image/png',
                  declaredByteSize: syntheticPng.byteLength,
                  capturedAt: null,
                  description: 'P5-05I synthetic private upload audit image.',
                  suggestedAltText: 'One-pixel synthetic audit image.',
                  photographerPresent: false,
                  rights: {
                    rightsStatus: 'public_domain',
                    rightsHolderPresent: false,
                    permissionReferencePresent: false,
                    licenseName: null,
                    licenseUrl: null,
                    publicDisplayPermission: true,
                  },
                },
              ],
              submitterNote: 'P5-05I synthetic direct-upload audit.',
            },
            acknowledgements: {
              privacyNoticeAccepted: true,
              submissionTermsAccepted: true,
            },
          },
        }),
      });
      checks.privateIntakeHttpStatus = intakeResponse.status;
      const intakePayload = await readJson(intakeResponse);
      checks.privateIntakeReceiptValid = isPrivateReceipt(intakePayload);
      if (checks.privateIntakeReceiptValid) privateReceipt = intakePayload as PrivateReceipt;

      const database = await verifyDatabaseProjection(
        privateReceipt?.submissionReference ?? null,
        targetId,
        upload.quarantineUploadId,
      );
      checks.databaseProjectionMatches = database.projectionMatches;
      checks.automaticMediaAbsent = database.automaticMediaAbsent;
    }

    const artifactsAfter = await readPublicArtifacts();
    checks.publicArtifactsUnchanged = Object.fromEntries(
      publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
    );
  } finally {
    if (objectUrl !== null) {
      try {
        const deleteResponse = await fetch(objectUrl, {
          method: 'DELETE',
          headers: signedS3Headers('DELETE', objectUrl, new Date()),
        });
        checks.cleanupDeleteHttpStatus = deleteResponse.status;
        const cleanupHead = await fetch(objectUrl, {
          method: 'HEAD',
          headers: signedS3Headers('HEAD', objectUrl, new Date()),
        });
        checks.cleanupHeadHttpStatus = cleanupHead.status;
        checks.cleanupConfirmed = [403, 404].includes(cleanupHead.status);
      } catch {
        checks.cleanupConfirmed = false;
      }
    }
  }

  const { succeeded, result } = buildPhotoDirectUploadAuditResult(checks);
  console.log(JSON.stringify(result, null, 2));
  if (!succeeded) process.exitCode = 1;
}

try {
  await main();
} catch {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 'photo-direct-upload-audit-v1',
        status: 'failed',
        failedChecks: ['probe_runtime'],
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
