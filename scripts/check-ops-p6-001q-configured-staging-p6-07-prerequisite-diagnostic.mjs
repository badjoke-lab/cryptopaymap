import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001q-configured-staging-p6-07-prerequisite-diagnostic.yml',
    'utf8',
  ),
  procedure: readFileSync(
    'docs/OPS_P6_001Q_CONFIGURED_STAGING_P6_07_PREREQUISITE_DIAGNOSTIC.md',
    'utf8',
  ),
  executor: readFileSync(
    'scripts/run-ops-p6-001q-configured-staging-p6-07-prerequisite-diagnostic.mjs',
    'utf8',
  ),
  p607Contract: readFileSync(
    'scripts/check-p6-07-configured-operational-monitoring-backup-restore-incident-evidence.js',
    'utf8',
  ),
  authorization: readFileSync('scripts/evaluate-ops-p6-001c-staging-authorization.mjs', 'utf8'),
};

const expectations = [
  [files.workflow, 'DIAGNOSE_CONFIGURED_STAGING_P6_07'],
  [files.workflow, 'staging.cryptopaymap.com'],
  [files.workflow, 'P6_07_RESTORE_DATABASE_URL'],
  [files.workflow, 'P6_07_BACKUP_ENCRYPTION_KEY'],
  [files.workflow, 'p6-07-prerequisite-diagnostic.json'],
  [files.workflow, 'Publish P6-07 prerequisite diagnostic'],
  [files.procedure, '`configuration_blocked`'],
  [files.procedure, '`evidence_blocked`'],
  [files.procedure, 'performs no database query, dump, mutation, backup, or restore'],
  [files.procedure, 'does not authorize backup, restore, alert, incident'],
  [files.executor, "const exactConfirmation = 'DIAGNOSE_CONFIGURED_STAGING_P6_07'"],
  [files.executor, "const approvedHostname = 'staging.cryptopaymap.com'"],
  [files.executor, "['P6-01', 'P6-02', 'P6-03', 'P6-04', 'P6-05', 'P6-06']"],
  [files.executor, "cache: 'no-store'"],
  [files.executor, "'/admin/api/dashboard'"],
  [files.executor, 'isolated_restore_database:not_distinct'],
  [files.executor, "state: 'diagnosed'"],
  [files.executor, "? 'evidence_blocked'"],
  [files.executor, "? 'configuration_blocked'"],
  [files.executor, "diagnostic: 'prerequisite_inventory'"],
  [files.p607Contract, 'P6-07 configured operational evidence contract passed.'],
  [
    files.authorization,
    "['P6-07', 'config/staging-authorization/p6-07-operations-recovery-receipt.json']",
  ],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001Q contract marker is missing: ${marker}`);
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
  'pg_dump',
  'pg_restore',
  'psql ',
  'wrangler r2 object put',
  'CLOUDFLARE_API_TOKEN=',
  'DATABASE_URL=',
  'P6_07_RESTORE_DATABASE_URL=',
  'P6_07_BACKUP_ENCRYPTION_KEY=',
];
for (const marker of forbidden) {
  if (files.executor.includes(marker)) {
    throw new Error(`OPS-P6-001Q diagnostic contains forbidden mutation or secret marker: ${marker}`);
  }
}

if (!files.executor.includes("predecessors.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001Q must require current P6-01 through P6-06 receipts.');
}
if (!files.executor.includes("receipt.checks?.externalFinal?.status === 'passed'")) {
  throw new Error('OPS-P6-001Q must require accepted P6-06 final external evidence.');
}
if (!files.executor.includes("hash(source) !== hash(restore)")) {
  throw new Error('OPS-P6-001Q must prove the isolated restore input differs from source.');
}
if (!files.executor.includes("!serialized.includes('postgresql://')")) {
  throw new Error('OPS-P6-001Q self-test must prove connection strings are not retained.');
}
if (!files.executor.includes("!serialized.includes('x'.repeat(32))")) {
  throw new Error('OPS-P6-001Q self-test must prove encryption material is not retained.');
}

console.log('OPS-P6-001Q configured staging P6-07 prerequisite diagnostic contract passed.');
