import { readFileSync } from 'node:fs';

const files = {
  contract: readFileSync('src/submissions/business-claim-payment-application-contract.ts', 'utf8'),
  service: readFileSync('src/admin/submissions/business-claim-payment-application.ts', 'utf8'),
  backend: readFileSync(
    'src/admin/submissions/drizzle-business-claim-payment-application-backend.ts',
    'utf8',
  ),
  authorization: readFileSync(
    'src/admin/submissions/business-claim-payment-application-authorization.ts',
    'utf8',
  ),
  route: readFileSync(
    'functions/admin/api/business-claim-applications/[applicationId]/apply-payments.ts',
    'utf8',
  ),
  serviceTest: readFileSync('tests/business-claim-payment-application.test.ts', 'utf8'),
  apiTest: readFileSync('tests/business-claim-payment-application-api.test.ts', 'utf8'),
  docs: readFileSync('docs/P5_07E4_BUSINESS_CLAIM_PAYMENT_APPLICATION.md', 'utf8'),
};

function requireMarkers(file, markers, label) {
  for (const marker of markers) {
    if (!file.includes(marker)) {
      throw new Error(`${label} is missing required marker: ${marker}`);
    }
  }
}

requireMarkers(
  files.contract,
  [
    'business-claim-payment-application-v1',
    'business-claim-payment-application-event-v1',
    'business-claim-payment-source-v1',
    'already_applied',
    'expectedDraftSetHash',
    'finalClaimAssetSets',
  ],
  'E4 contract',
);

requireMarkers(
  files.service,
  [
    'parseBusinessClaimPaymentPlanEventPayload',
    'assertPlanShape',
    'exact durable Business Claim payment plan',
    'exactly one primary row',
    'final existing Claim payment set would contain multiple primary rows',
    'verifyCanonicalReplayState',
    'deriveFinalClaimAssetSets',
    'unexpected or missing Claim Asset row',
    'transitionSubmissionApplicationLifecycle',
    'submission:business-claim-payments:apply',
    'business_claim_payments_applied',
  ],
  'E4 service',
);

requireMarkers(
  files.backend,
  [
    'pg_advisory_xact_lock',
    'business_claim_payment_plan_prepared',
    'business_claim_payments_applied',
    'business_claim_payment_information_applied',
    'database.insert(acceptanceClaims)',
    'database.insert(claimAssets)',
    'database.insert(sourceRecords)',
    'database.insert(provenanceLinks)',
    'database.insert(verificationEvents)',
    "sourceType} = 'business_representative'",
    "application.application_status = 'pending'",
    "application.publication_status = 'blocked'",
  ],
  'E4 Drizzle backend',
);

if (
  files.backend.includes('database.delete(acceptanceClaims)') ||
  files.backend.includes('database.delete(claimAssets)') ||
  files.backend.includes('database.update(entities)') ||
  files.backend.includes('database.update(locations)')
) {
  throw new Error('E4 must not delete canonical payment rows or mutate Entity/Location fields.');
}

requireMarkers(
  files.authorization,
  [
    'CPM_ADMIN_BUSINESS_CLAIM_PAYMENT_APPLY_SUBJECTS',
    'CPM_BUSINESS_CLAIM_SOURCE_ID',
    'submission:business-claim-payments:apply',
  ],
  'E4 authorization',
);
requireMarkers(
  files.route,
  [
    "Cache-Control': 'private, no-store'",
    'business_claim_payment_apply_conflict',
    'business_claim_payment_apply_ineligible',
  ],
  'E4 protected route',
);
requireMarkers(
  files.serviceTest,
  [
    'atomically inserts a planned row on an existing Claim',
    'creates one hidden candidate Claim with two exact payment rows',
    'preserves an already-present row',
    'recovers lifecycle after canonical commit without a second canonical write',
    'multiple primary rows',
  ],
  'E4 service tests',
);
requireMarkers(
  files.apiTest,
  ['bounded private receipt', 'fails closed', 'without exposing private canonical material'],
  'E4 API tests',
);
requireMarkers(
  files.docs,
  [
    'P5-07E4',
    'atomic canonical transaction',
    'replay-safe recovery',
    'Entity and Location field-level provenance',
  ],
  'E4 documentation',
);

console.log('P5-07E4 Business Claim payment application audit passed.');
