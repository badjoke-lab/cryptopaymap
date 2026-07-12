import { createHash, randomUUID } from 'node:crypto';
import { buildP502rLiveJourneyResult } from './p5-02r-live-journey-result.mjs';
import { p502rSyntheticSuggestRequest } from './p5-02r-synthetic-suggest-fixture.mjs';

const defaultBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const baseUrl = new URL(process.env.CPM_P5_02R_REVIEW_URL ?? defaultBaseUrl);
const requestId = randomUUID();
const challengeToken = 'XXXX.DUMMY.TOKEN.XXXX';
const officialTestSecret = '1x0000000000000000000000000000000AA';
const publicArtifactPaths = ['/data/manifest.json', '/version.json'];
const siteverifyEndpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function validateOfficialDummyToken(requestFormat, idempotencyIncluded) {
  const values = {
    secret: officialTestSecret,
    response: challengeToken,
    ...(idempotencyIncluded ? { idempotency_key: randomUUID() } : {}),
  };
  const isJson = requestFormat === 'json';
  const response = await fetch(siteverifyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
    },
    body: isJson ? JSON.stringify(values) : new URLSearchParams(values),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Only bounded metadata is returned to the caller.
  }
  const metadata = {
    requestFormat,
    idempotencyIncluded,
    httpStatus: response.status,
    success: payload?.success === true,
    hostname: typeof payload?.hostname === 'string' ? payload.hostname : null,
    action: typeof payload?.action === 'string' ? payload.action : null,
    hostnameMatches: payload?.hostname === 'localhost',
    actionMatches: payload?.action === 'test',
  };
  return metadata;
}

function officialDummyMetadataSupported(metadata) {
  const documentedMetadata = metadata.hostname === 'localhost' && metadata.action === 'test';
  const observedMetadata = metadata.hostname === 'example.com' && metadata.action === null;
  return documentedMetadata || observedMetadata;
}

async function runSiteverifyTransportMatrix() {
  const results = [];
  for (const requestFormat of ['json', 'application/x-www-form-urlencoded']) {
    for (const idempotencyIncluded of [false, true]) {
      results.push(await validateOfficialDummyToken(requestFormat, idempotencyIncluded));
    }
  }
  console.log(JSON.stringify({ siteverifyTransportMatrix: results }, null, 2));
  if (results.some((result) => result.httpStatus !== 200 || !result.success)) {
    process.exitCode = 1;
  }
}

async function readPublicArtifacts() {
  return Object.fromEntries(
    await Promise.all(
      publicArtifactPaths.map(async (path) => {
        const response = await fetch(new URL(path, baseUrl), { cache: 'no-store' });
        if (!response.ok) throw new Error(`public_artifact_${response.status}`);
        return [path, sha256(Buffer.from(await response.arrayBuffer()))];
      }),
    ),
  );
}

async function post(body) {
  const response = await fetch(new URL('/api/suggest', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestId,
    },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Only response-shape booleans are reported below.
  }
  return { status: response.status, payload };
}

function isReceipt(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.submissionReference === 'string' &&
    typeof value.statusSecret === 'string' &&
    typeof value.submittedAt === 'string' &&
    Object.keys(value).length === 3
  );
}

if (process.argv.includes('--siteverify-transport-matrix')) {
  await runSiteverifyTransportMatrix();
  process.exit(process.exitCode ?? 0);
}

const artifactsBefore = await readPublicArtifacts();
const dummyTokenValidation = await validateOfficialDummyToken('json', true);
console.log(JSON.stringify({ dummyTokenValidation }, null, 2));
if (
  dummyTokenValidation.httpStatus !== 200 ||
  !dummyTokenValidation.success ||
  !officialDummyMetadataSupported(dummyTokenValidation)
) {
  process.exit(1);
}

const originalBody = p502rSyntheticSuggestRequest(challengeToken, 'P5-02R automated review probe');
const first = await post(originalBody);
const firstReceiptValid = first.status === 202 && isReceipt(first.payload);

if (!firstReceiptValid) {
  const artifactsAfter = await readPublicArtifacts();
  const publicArtifactsUnchanged = Object.fromEntries(
    publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
  );
  console.log(
    JSON.stringify(
      {
        status: 'failed',
        failedStage: first.status === 429 ? 'rate_limit' : 'first_post',
        firstPost: { httpStatus: first.status, receiptShapeMatches: false },
        publicArtifactsUnchanged,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const replay = await post(originalBody);
const changed = await post(
  p502rSyntheticSuggestRequest(
    challengeToken,
    'P5-02R automated review probe changed-content check',
  ),
);
const artifactsAfter = await readPublicArtifacts();

const replayReceiptValid = replay.status === 202 && isReceipt(replay.payload);
const replayReferenceMatches =
  firstReceiptValid &&
  replayReceiptValid &&
  first.payload.submissionReference === replay.payload.submissionReference;
const replayStatusSecretMatches =
  firstReceiptValid &&
  replayReceiptValid &&
  first.payload.statusSecret === replay.payload.statusSecret;
const conflictShapeMatches =
  changed.status === 409 &&
  changed.payload !== null &&
  typeof changed.payload === 'object' &&
  changed.payload.error === 'suggest_request_conflict' &&
  Object.keys(changed.payload).length === 1;
const publicArtifactsUnchanged = Object.fromEntries(
  publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
);

const { succeeded, result } = buildP502rLiveJourneyResult({
  firstHttpStatus: first.status,
  firstReceiptValid,
  replayHttpStatus: replay.status,
  replayReceiptValid,
  replayReferenceMatches,
  replayStatusSecretMatches,
  changedContentHttpStatus: changed.status,
  conflictShapeMatches,
  publicArtifactsUnchanged,
});

console.log(JSON.stringify(result, null, 2));

if (!succeeded) {
  process.exitCode = 1;
}
