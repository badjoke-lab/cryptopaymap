import { readFileSync } from 'node:fs';

const files = {
  contract: readFileSync('src/submissions/business-claim-field-provenance-contract.ts', 'utf8'),
  service: readFileSync('src/admin/submissions/business-claim-field-provenance.ts', 'utf8'),
  backend: readFileSync(
    'src/admin/submissions/drizzle-business-claim-field-provenance-backend.ts',
    'utf8',
  ),
  authorization: readFileSync(
    'src/admin/submissions/business-claim-field-provenance-authorization.ts',
    'utf8',
  ),
  route: readFileSync(
    'functions/admin/api/business-claim-field-applications/[submissionId]/complete-provenance.ts',
    'utf8',
  ),
  serviceTest: readFileSync('tests/business-claim-field-provenance.test.ts', 'utf8'),
  apiTest: readFileSync('tests/business-claim-field-provenance-api.test.ts', 'utf8'),
  docs: readFileSync('docs/P5_07E5_BUSINESS_CLAIM_FIELD_PROVENANCE.md', 'utf8'),
};

function requireMarkers(file, markers, label) {
  for (const marker of markers) {
    if (!file.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
  }
}

requireMarkers(
  files.contract,
  [
    'business-claim-field-provenance-v1',
    'business-claim-field-provenance-source-v1',
    'business-claim-field-provenance-event-v1',
    'expectedFieldApplicationEventId',
    'expectedTargetUpdatedAt',
  ],
  'E5 contract',
);
requireMarkers(
  files.service,
  [
    'parseBusinessClaimFieldApplicationEventPayload',
    'business_claim_fields_applied',
    'field_decisions_committed',
    'An H2-applied canonical field no longer has the exact applied value.',
    'current correction provenance owner already exists',
    'submission:business-claim-field-provenance:complete',
    'business-claim-fields:',
  ],
  'E5 service',
);
requireMarkers(
  files.backend,
  [
    'pg_advisory_xact_lock',
    "sourceType} = 'business_representative'",
    'database.insert(sourceRecords)',
    'database.insert(provenanceLinks)',
    "provenanceRole: 'correction'",
    'business_claim_field_provenance_completed',
    'field_provenance_completed',
  ],
  'E5 Drizzle backend',
);
if (
  files.backend.includes('database.update(entities)') ||
  files.backend.includes('database.update(locations)') ||
  files.backend.includes('database.delete(entities)') ||
  files.backend.includes('database.delete(locations)')
) {
  throw new Error('E5 must not mutate or delete Entity or Location canonical rows.');
}
requireMarkers(
  files.authorization,
  [
    'CPM_ADMIN_BUSINESS_CLAIM_FIELD_PROVENANCE_SUBJECTS',
    'CPM_BUSINESS_CLAIM_SOURCE_ID',
    'submission:business-claim-field-provenance:complete',
  ],
  'E5 authorization',
);
requireMarkers(
  files.route,
  [
    "'Cache-Control': 'private, no-store'",
    'business_claim_field_provenance_conflict',
    'business_claim_field_provenance_ineligible',
  ],
  'E5 protected route',
);
requireMarkers(
  files.serviceTest,
  [
    'creates an exact private Source Record and field-level correction provenance',
    'clear-to-null and clear-to-empty',
    'accepted canonical field changes',
    'replays the exact request',
    'backend idempotency conflict raised during a commit race',
    'active correction provenance owner',
  ],
  'E5 service tests',
);
requireMarkers(
  files.apiTest,
  ['bounded private receipt', 'fails closed', 'without exposing private source'],
  'E5 API tests',
);
requireMarkers(
  files.docs,
  [
    'P5-07E5',
    'does not update Entity or Location fields',
    'business_claim_field_provenance_completed',
    'P5-07F',
  ],
  'E5 documentation',
);

console.log('P5-07E5 Business Claim field provenance audit passed.');
