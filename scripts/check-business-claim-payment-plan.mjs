import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const contract = read('src/submissions/business-claim-payment-plan-contract.ts');
for (const marker of [
  'business-claim-payment-plan-v1',
  'business-claim-payment-plan-event-v1',
  'expectedDraftSetHash',
  'plannedClaims',
  'existingClaims',
  'plannedClaimAssetRowId',
  'already_present',
]) {
  assert.ok(contract.includes(marker), `payment plan contract lost ${marker}`);
}

const service = read('src/admin/submissions/business-claim-payment-plan.ts');
for (const marker of [
  'readBusinessClaimPaymentPreview',
  'selection_required',
  'business-claim-payment-candidate',
  'business-claim-payment-row',
  'claimAssetSetHash',
  'readCurrentPlanEvent',
  'business_claim_payment_plan_prepared',
]) {
  assert.ok(service.includes(marker), `payment plan service lost ${marker}`);
}

const backend = read('src/admin/submissions/drizzle-business-claim-payment-plan-backend.ts');
for (const marker of [
  'pg_advisory_xact_lock',
  'business_claim_fields_applied',
  'business_claim_relationship_approved',
  'business_claim_payment_plan_prepared',
  "application.application_status = 'pending'",
  "application.publication_status = 'blocked'",
]) {
  assert.ok(backend.includes(marker), `payment plan backend lost ${marker}`);
}
for (const forbidden of [
  'database.insert(acceptanceClaims)',
  'database.insert(claimAssets)',
  '.update(acceptanceClaims)',
  '.update(claimAssets)',
  'activateExport',
  'publishRelease',
]) {
  assert.ok(!backend.includes(forbidden), `payment plan unexpectedly mutates through ${forbidden}`);
}

const route = read(
  'functions/admin/api/business-claim-applications/[applicationId]/plan-payments.ts',
);
assert.ok(route.includes("'Cache-Control': 'private, no-store'"));
assert.ok(route.includes('CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_PLAN_SUBJECTS'));
assert.ok(route.includes('readProtectedAdminIdentity'));
assert.ok(route.includes('onRequestPost'));

const status = read('docs/PROJECT_STATUS.md');
for (const marker of ['P5-07D3', 'P5-07D4', 'P5-07E1', 'P5-07E2', 'P5-07E3']) {
  assert.ok(status.includes(marker), `project status lost ${marker}`);
}

console.log('P5-07E3 Business Claim payment plan check passed.');
