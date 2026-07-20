import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const service = read('src/admin/submissions/business-claim-payment-preview.ts');
for (const marker of [
  'business-claim-payment-preview-v1',
  "'attach_existing_claim'",
  "'create_candidate_claim'",
  "'needs_selection'",
  "'already_present'",
  'acceptedProposals',
  'draftSetHash',
  'readProcessorCandidates',
]) {
  assert.ok(service.includes(marker), `payment preview service lost ${marker}`);
}

const backend = read('src/admin/submissions/drizzle-business-claim-payment-preview-backend.ts');
for (const marker of [
  'business_claim_fields_applied',
  'payment_processor',
  'acceptanceClaims',
  'claimAssets',
  'readPaymentMethodBySlug',
]) {
  assert.ok(backend.includes(marker), `payment preview backend lost ${marker}`);
}
for (const forbidden of [
  'database.insert(acceptanceClaims)',
  'database.insert(claimAssets)',
  '.update(acceptanceClaims)',
  '.update(claimAssets)',
  'publishRelease',
  'activateExport',
]) {
  assert.ok(
    !backend.includes(forbidden),
    `payment preview unexpectedly mutates through ${forbidden}`,
  );
}

const route = read(
  'functions/admin/api/business-claim-applications/[applicationId]/payment-preview.ts',
);
assert.ok(route.includes("'Cache-Control': 'private, no-store'"));
const authorization = read('src/admin/submissions/business-claim-payment-preview-authorization.ts');
assert.ok(authorization.includes('CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PREVIEW_SUBJECTS'));
assert.ok(route.includes('readProtectedAdminIdentity'));

const status = read('docs/PROJECT_STATUS.md');
assert.ok(status.includes('P5-07D3'));
assert.ok(status.includes('P5-07D4'));
assert.ok(status.includes('P5-07E1'));
assert.ok(status.includes('P5-07E2'));

console.log('P5-07E2 Business Claim payment preview check passed.');
