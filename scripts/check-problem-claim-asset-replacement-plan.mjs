import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const contract = read('src/submissions/problem-claim-asset-replacement-plan-contract.ts');
for (const required of [
  "z.literal('problem-claim-asset-replacement-plan-v1')",
  "z.literal('problem-claim-asset-replacement-plan-event-v1')",
  'expectedApplicationUpdatedAt',
  'expectedClaimUpdatedAt',
  'expectedSourceDecisionEventId',
  'expectedCurrentSetHash',
  'reviewed_current_row',
  'currentSet',
  'proposedSet',
]) {
  assert.ok(contract.includes(required), `Missing D6 contract boundary: ${required}`);
}

const service = read('src/admin/submissions/problem-claim-asset-replacement-plan.ts');
for (const required of [
  'readProblemClaimAssetSetPreview',
  'validateCompleteSet',
  'deterministicUuid',
  'problem_claim_asset_replacement_planned',
  'selection_required',
  'idempotency_conflict',
]) {
  assert.ok(service.includes(required), `Missing D6 planning behavior: ${required}`);
}
assert.doesNotMatch(service, /acceptanceClaims\).*\.update|claimAssets\).*\.update/);

const backend = read(
  'src/admin/submissions/drizzle-problem-claim-asset-replacement-plan-backend.ts',
);
assert.match(backend, /pg_advisory_xact_lock/);
assert.match(backend, /jsonb_agg/);
assert.match(backend, /problem_claim_asset_replacement_planned/);
assert.doesNotMatch(backend, /delete\(claimAssets\)|update\(claimAssets\)/);
assert.doesNotMatch(backend, /update\(acceptanceClaims\)/);

const authorization = read(
  'src/admin/submissions/problem-claim-asset-replacement-plan-authorization.ts',
);
assert.match(authorization, /CPM_ADMIN_PROBLEM_CLAIM_ASSET_PLAN_SUBJECTS/);
assert.match(authorization, /submission:problem-claim-asset-plan:prepare/);

const api = read('functions/admin/api/problem-applications/[applicationId]/plan-claim-assets.ts');
assert.match(api, /onRequestPost/);
assert.match(api, /Cache-Control': 'private, no-store'/);
assert.doesNotMatch(api, /onRequestGet|onRequestPut|onRequestDelete/);

const status = read('docs/PROJECT_STATUS.md');
assert.match(status, /P5-07D6/);
assert.match(status, /P5-07D5.*#252/);

console.log('P5-07D6 Claim Asset replacement plan check passed.');
