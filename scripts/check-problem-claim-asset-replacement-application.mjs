import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const contract = read(
  'src/submissions/problem-claim-asset-replacement-application-contract.ts',
);
for (const required of [
  "z.literal('problem-claim-asset-replacement-application-v1')",
  "z.literal('problem-claim-asset-replacement-source-v1')",
  "z.literal('problem-claim-asset-replacement-application-event-v1')",
  'expectedPlanCreatedAt',
  'expectedCurrentSetHash',
  'expectedProposedSetHash',
  'selectedCurrentRowId',
  'replacementRowId',
]) {
  assert.ok(contract.includes(required), `Missing D7 contract boundary: ${required}`);
}

const service = read(
  'src/admin/submissions/problem-claim-asset-replacement-application.ts',
);
for (const required of [
  'parseProblemClaimAssetReplacementPlanEventPayload',
  'validateReplacementShape',
  'problem_claim_assets_replaced',
  'commitClaimAssetReplacement',
  "receipt: { kind: 'submission_event'",
  'alreadyAppliedReceipt',
]) {
  assert.ok(service.includes(required), `Missing D7 application behavior: ${required}`);
}
assert.doesNotMatch(service, /update\(claimAssets\)|delete\(claimAssets\)|insert\(claimAssets\)/);

const backend = read(
  'src/admin/submissions/drizzle-problem-claim-asset-replacement-application-backend.ts',
);
for (const required of [
  'pg_advisory_xact_lock',
  'jsonb_agg',
  'delete(claimAssets)',
  'insert(claimAssets)',
  "subjectType: 'claim_asset'",
  "provenanceRole: 'correction'",
  "eventType: 'corrected'",
  'problem_claim_assets_replaced',
]) {
  assert.ok(backend.includes(required), `Missing D7 persistence behavior: ${required}`);
}
assert.doesNotMatch(backend, /update\(claimAssets\)/);
assert.doesNotMatch(backend, /set\(\{\s*assetId|set\(\{\s*networkId/);

const authorization = read(
  'src/admin/submissions/problem-claim-asset-replacement-application-authorization.ts',
);
assert.match(authorization, /CPM_ADMIN_PROBLEM_CLAIM_ASSET_APPLY_SUBJECTS/);
assert.match(authorization, /submission:problem-claim-assets:apply/);
assert.match(authorization, /CPM_PROBLEM_REPORT_SOURCE_ID/);

const api = read(
  'functions/admin/api/problem-applications/[applicationId]/apply-claim-assets.ts',
);
assert.match(api, /onRequestPost/);
assert.match(api, /Cache-Control': 'private, no-store'/);
assert.doesNotMatch(api, /onRequestGet|onRequestPut|onRequestDelete/);

const status = read('docs/PROJECT_STATUS.md');
assert.match(status, /P5-07D7/);
assert.match(status, /P5-07D6.*#253/);

console.log('P5-07D7 Claim Asset replacement application check passed.');
