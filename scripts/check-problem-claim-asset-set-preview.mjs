import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const service = read('src/admin/submissions/problem-claim-asset-set-preview.ts');
for (const required of [
  "z.literal('problem-claim-asset-set-preview-v1')",
  "reportType === 'wrong_asset'",
  "reportType === 'wrong_network'",
  "readiness = 'needs_selection'",
  'claimAssetPublicationContextSchema.safeParse',
  'currentSetHash',
  'proposedSetHash',
  'replacementRowId',
]) {
  assert.ok(service.includes(required), `Missing D5 preview boundary: ${required}`);
}
assert.doesNotMatch(service, /commit|update\(|delete\(|insert\(/);
assert.doesNotMatch(service, /reviewerNote|privateEvidenceUrl|contact/);

const backend = read('src/admin/submissions/drizzle-problem-claim-asset-set-preview-backend.ts');
for (const table of ['claimAssets', 'assets', 'networks', 'paymentMethods']) {
  assert.ok(backend.includes(table), `Missing D5 read source: ${table}`);
}
assert.doesNotMatch(backend, /\.update\(|\.delete\(|\.insert\(|database\.batch/);
assert.match(backend, /\.limit\(51\)/);

const authorization = read(
  'src/admin/submissions/problem-claim-asset-set-preview-authorization.ts',
);
assert.match(authorization, /CPM_ADMIN_PROBLEM_CLAIM_ASSET_PREVIEW_SUBJECTS/);
assert.match(authorization, /submission:problem-claim-asset-preview:read/);

const api = read('functions/admin/api/problem-applications/[applicationId]/claim-asset-preview.ts');
assert.match(api, /Cache-Control': 'private, no-store'/);
assert.doesNotMatch(api, /onRequestPost|onRequestPut|onRequestDelete/);

const tests = read('tests/problem-claim-asset-set-preview.test.ts');
assert.match(tests, /deterministic complete replacement set/);
assert.match(tests, /multiple-row Claim/);
assert.match(tests, /already matches/);
assert.match(tests, /rejects an instruction correction/);

console.log('P5-07D5 Claim Asset replacement preview check passed.');
