import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { buildP503iLiveJourneyResult } from './p5-03i-live-journey-result.mjs';
import {
  p503iSyntheticPaymentReport,
  p503iSyntheticProblemReport,
} from './p5-03i-synthetic-report-fixtures.mjs';

const defaultBaseUrl = 'https://review.cryptopaymap-staging.pages.dev';
const baseUrl = new URL(process.env.CPM_P5_03I_REVIEW_URL ?? defaultBaseUrl);
const databaseUrl = process.env.DATABASE_URL;
const challengeToken = 'XXXX.DUMMY.TOKEN.XXXX';
const expectedSiteKey = '1x00000000000000000000AA';
const expectedAction = 'submission_intake';
const publicArtifactPaths = ['/data/manifest.json', '/version.json'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function cspMatches(value) {
  return (
    typeof value === 'string' &&
    value.includes('https://challenges.cloudflare.com') &&
    value.includes("form-action 'self'") &&
    value.includes("frame-ancestors 'none'")
  );
}

async function readPublicArtifacts() {
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

async function inspectPage(path) {
  const response = await fetch(new URL(path, baseUrl), { cache: 'no-store' });
  return {
    httpStatus: response.status,
    matches:
      response.status === 200 &&
      response.headers.get('cache-control')?.includes('no-store') === true &&
      response.headers.get('referrer-policy') === 'no-referrer' &&
      cspMatches(response.headers.get('content-security-policy')),
  };
}

async function readClientConfiguration() {
  const response = await fetch(new URL('/api/reports/config', baseUrl), { cache: 'no-store' });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Only bounded comparison booleans are retained.
  }
  return {
    httpStatus: response.status,
    matches:
      response.status === 200 &&
      payload !== null &&
      typeof payload === 'object' &&
      payload.siteKey === expectedSiteKey &&
      payload.action === expectedAction &&
      Object.keys(payload).length === 2,
  };
}

async function postReport(requestId, body) {
  const response = await fetch(new URL('/api/reports', baseUrl), {
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
    // Only bounded response checks are retained.
  }
  return { status: response.status, payload };
}

async function verifyDatabaseProjections(paymentReference, problemReference) {
  if (!databaseUrl || !paymentReference || !problemReference) {
    return { paymentMatches: false, problemMatches: false };
  }

  const sql = neon(databaseUrl);
  const rows = await sql`
    select
      s.public_id,
      s.submission_type,
      s.target_type,
      p.normalized_payload
    from submissions s
    join submission_payloads p on p.submission_id = s.id
    where s.public_id = ${paymentReference}
       or s.public_id = ${problemReference}
  `;

  const payment = rows.find((row) => row.public_id === paymentReference);
  const problem = rows.find((row) => row.public_id === problemReference);
  return {
    paymentMatches:
      payment?.submission_type === 'payment_report' &&
      payment?.target_type === 'entity' &&
      payment?.normalized_payload?.reportKind === 'payment_report',
    problemMatches:
      problem?.submission_type === 'problem_report' &&
      problem?.target_type === 'entity' &&
      problem?.normalized_payload?.reportKind === 'problem_report',
  };
}

async function main() {
  const artifactsBefore = await readPublicArtifacts();
  const clientConfiguration = await readClientConfiguration();
  const paymentPage = await inspectPage('/payment-report');
  const problemPage = await inspectPage('/report');

  const paymentRequestId = randomUUID();
  const paymentTargetId = randomUUID();
  const paymentBody = p503iSyntheticPaymentReport(
    paymentTargetId,
    challengeToken,
    'P5-03I synthetic payment report.',
  );
  const paymentFirst = await postReport(paymentRequestId, paymentBody);
  const paymentFirstValid = paymentFirst.status === 202 && isReceipt(paymentFirst.payload);
  const paymentReplay = await postReport(paymentRequestId, paymentBody);
  const paymentReplayValid = paymentReplay.status === 202 && isReceipt(paymentReplay.payload);
  const paymentChanged = await postReport(
    paymentRequestId,
    p503iSyntheticPaymentReport(
      paymentTargetId,
      challengeToken,
      'P5-03I changed-content conflict probe.',
    ),
  );

  const problemRequestId = randomUUID();
  const problemBody = p503iSyntheticProblemReport(randomUUID(), challengeToken);
  const problemFirst = await postReport(problemRequestId, problemBody);
  const problemFirstValid = problemFirst.status === 202 && isReceipt(problemFirst.payload);
  const problemReplay = await postReport(problemRequestId, problemBody);
  const problemReplayValid = problemReplay.status === 202 && isReceipt(problemReplay.payload);

  const database = await verifyDatabaseProjections(
    paymentFirstValid ? paymentFirst.payload.submissionReference : null,
    problemFirstValid ? problemFirst.payload.submissionReference : null,
  );
  const artifactsAfter = await readPublicArtifacts();
  const publicArtifactsUnchanged = Object.fromEntries(
    publicArtifactPaths.map((path) => [path, artifactsBefore[path] === artifactsAfter[path]]),
  );

  const paymentConflictShapeMatches =
    paymentChanged.status === 409 &&
    paymentChanged.payload !== null &&
    typeof paymentChanged.payload === 'object' &&
    paymentChanged.payload.error === 'report_request_conflict' &&
    Object.keys(paymentChanged.payload).length === 1;

  const { succeeded, result } = buildP503iLiveJourneyResult({
    clientConfigurationMatches: clientConfiguration.matches,
    paymentPageHeadersMatch: paymentPage.matches,
    problemPageHeadersMatch: problemPage.matches,
    paymentFirstHttpStatus: paymentFirst.status,
    paymentFirstReceiptValid: paymentFirstValid,
    paymentReplayHttpStatus: paymentReplay.status,
    paymentReplayReceiptValid: paymentReplayValid,
    paymentReplayReferenceMatches:
      paymentFirstValid &&
      paymentReplayValid &&
      paymentFirst.payload.submissionReference === paymentReplay.payload.submissionReference,
    paymentReplayStatusSecretMatches:
      paymentFirstValid &&
      paymentReplayValid &&
      paymentFirst.payload.statusSecret === paymentReplay.payload.statusSecret,
    paymentChangedContentHttpStatus: paymentChanged.status,
    paymentConflictShapeMatches,
    problemFirstHttpStatus: problemFirst.status,
    problemFirstReceiptValid: problemFirstValid,
    problemReplayHttpStatus: problemReplay.status,
    problemReplayReceiptValid: problemReplayValid,
    problemReplayReferenceMatches:
      problemFirstValid &&
      problemReplayValid &&
      problemFirst.payload.submissionReference === problemReplay.payload.submissionReference,
    problemReplayStatusSecretMatches:
      problemFirstValid &&
      problemReplayValid &&
      problemFirst.payload.statusSecret === problemReplay.payload.statusSecret,
    databasePaymentProjectionMatches: database.paymentMatches,
    databaseProblemProjectionMatches: database.problemMatches,
    publicArtifactsUnchanged,
  });

  console.log(
    JSON.stringify(
      {
        clientConfigurationHttpStatus: clientConfiguration.httpStatus,
        paymentPageHttpStatus: paymentPage.httpStatus,
        problemPageHttpStatus: problemPage.httpStatus,
        ...result,
      },
      null,
      2,
    ),
  );

  if (!succeeded) process.exitCode = 1;
}

try {
  await main();
} catch {
  console.log(
    JSON.stringify(
      {
        status: 'failed',
        failedStage: 'probe_runtime',
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
