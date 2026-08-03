import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001r-configured-staging-p6-06-continuity-revalidation.yml',
    'utf8',
  ),
  procedure: readFileSync(
    'docs/OPS_P6_001R_CONFIGURED_STAGING_P6_06_CONTINUITY_REVALIDATION.md',
    'utf8',
  ),
  executor: readFileSync(
    'scripts/run-ops-p6-001r-configured-staging-p6-06-continuity-revalidation.mjs',
    'utf8',
  ),
  p606Contract: readFileSync(
    'scripts/check-p6-06-configured-domain-cutover-rollback-evidence.js',
    'utf8',
  ),
};

const expectations = [
  [files.workflow, 'REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY'],
  [files.workflow, 'p6-06-domain-cutover-rollback-receipt.json'],
  [files.workflow, 'Publish P6-06 continuity receipt'],
  [files.procedure, '`existing_candidate_requires_approval`'],
  [files.procedure, 'performs no Cloudflare mutation'],
  [files.procedure, 'does not claim that a new rollback drill occurred'],
  [files.executor, "const exactConfirmation = 'REVALIDATE_CONFIGURED_STAGING_P6_06_CONTINUITY'"],
  [files.executor, "const approvedHostname = 'staging.cryptopaymap.com'"],
  [files.executor, "receipt?.decision === 'existing_candidate_requires_approval'"],
  [files.executor, 'receipt?.checks?.inventory?.candidateCount === 1'],
  [files.executor, "prior.state === 'authenticated_prior'"],
  [files.executor, "evidenceSource: 'prior_accepted_receipt'"],
  [files.executor, "status: 'existing_final'"],
  [files.executor, "procedure: 'OPS-P6-001R configured staging P6-06 continuity revalidation'"],
  [files.executor, "!serialized.includes(priorCommit)"],
  [files.executor, "!serialized.includes(approvedHostname)"],
  [files.p606Contract, 'P6-06 configured domain cutover and rollback evidence contract passed.'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001R contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  "method: 'POST'",
  'method: "POST"',
  "method: 'PUT'",
  'method: "PUT"',
  "method: 'PATCH'",
  'method: "PATCH"',
  "method: 'DELETE'",
  'method: "DELETE"',
  'pages_domain_add',
  'pages_domain_delete',
  'dns_record_create',
  'dns_record_delete',
  'wrangler pages deploy',
  'wrangler r2 object put',
  'pg_dump',
  'pg_restore',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'P6_06_STAGING_ZONE_ID',
];
for (const marker of forbidden) {
  if (files.executor.includes(marker)) {
    throw new Error(`OPS-P6-001R continuity executor contains forbidden mutation marker: ${marker}`);
  }
}

if (!files.executor.includes("predecessors.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001R must require current P6-01 through P6-05 receipts.');
}
if (!files.executor.includes("receipt?.checks?.rollback?.status === 'passed'")) {
  throw new Error('OPS-P6-001R must require prior rollback evidence.');
}
if (!files.executor.includes("receipt?.checks?.externalRollback?.status === 'passed'")) {
  throw new Error('OPS-P6-001R must require prior external rollback evidence.');
}
if (!files.executor.includes("receipt?.checks?.finalRestore?.status === 'passed'")) {
  throw new Error('OPS-P6-001R must require prior final restore evidence.');
}
if (!files.executor.includes("marker?.releaseId !== expectedReleaseId")) {
  throw new Error('OPS-P6-001R must bind the public domain to the current P6-05 release.');
}

console.log('OPS-P6-001R configured staging P6-06 continuity contract passed.');
