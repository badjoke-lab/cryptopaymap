import { readFileSync } from 'node:fs';

const paths = {
  workflow: '.github/workflows/ops-p6-001y-configured-staging-p6-07-backup-integrity.yml',
  docs: 'docs/OPS_P6_001Y_CONFIGURED_STAGING_P6_07_BACKUP_INTEGRITY.md',
  executor: 'scripts/run-ops-p6-001y-configured-staging-p6-07-backup-integrity.mjs',
  checker: 'scripts/check-ops-p6-001y-configured-staging-p6-07-backup-integrity.mjs',
  evidence: 'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
};
const files = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
);

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_07_Q3'],
  [files.workflow, 'P6_07_BACKUP_ENCRYPTION_KEY: ${{ secrets.P6_07_BACKUP_ENCRYPTION_KEY }}'],
  [files.workflow, 'DATABASE_URL: ${{ secrets.DATABASE_URL }}'],
  [files.workflow, 'postgresql-client-17'],
  [files.workflow, '/usr/lib/postgresql/17/bin'],
  [files.workflow, 'SHOW server_version_num'],
  [files.workflow, 'p6-07-q3-backup.enc.json'],
  [files.workflow, 'p6-07-backup-integrity-receipt.json'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q3'"],
  [
    files.executor,
    "const q2Path = 'config/staging-authorization/p6-07-monitoring-alert-receipt.json'",
  ],
  [
    files.executor,
    "const receiptPath = 'config/staging-authorization/p6-07-backup-integrity-receipt.json'",
  ],
  [files.executor, 'createCipheriv('],
  [files.executor, 'createDecipheriv('],
  [files.executor, "'aes-256-gcm'"],
  [files.executor, "execFileSync('pg_dump'"],
  [files.executor, "execFileSync('pg_restore'"],
  [files.executor, "'submission_private_payload_data'"],
  [files.executor, "'submission_private_contact_data'"],
  [files.executor, 'corruptionRejected'],
  [files.executor, "state = 'configuration_blocked'"],
  [files.executor, 'backup_encryption:missing'],
  [files.executor, 'keyMaterialRetained: false'],
  [files.executor, "immutability: 'run_scoped_artifact'"],
  [files.docs, 'encrypted backup artifact'],
  [files.docs, 'corruption rejection'],
  [files.docs, 'isolated restore'],
  [
    files.evidence,
    'A successful scheduled job without a verified backup artifact is not backup proof.',
  ],
];

for (const [text, expected] of expectations) {
  if (!text.includes(expected)) throw new Error(`OPS-P6-001Y contract missing: ${expected}`);
}

if (files.workflow.includes('P6_07_RESTORE_DATABASE_URL')) {
  throw new Error('OPS-P6-001Y must not use the isolated restore target.');
}
if (/console\.log\([^\n]*(DATABASE_URL|P6_07_BACKUP_ENCRYPTION_KEY)/.test(files.executor)) {
  throw new Error('OPS-P6-001Y must not log protected configuration.');
}
if (/writeJson\([^\n]*(databaseUrl|encryptionKey)/.test(files.executor)) {
  throw new Error('OPS-P6-001Y must not retain protected configuration values.');
}
if (!files.executor.includes("receipt.state = 'accepted'")) {
  throw new Error('OPS-P6-001Y must retain an explicit accepted state.');
}
if (!files.executor.includes("receipt.exceptions.push('precondition_failed')")) {
  throw new Error('OPS-P6-001Y must fail closed on predecessor or binding failure.');
}
if (!files.executor.includes("throw new Error('corruption_not_rejected')")) {
  throw new Error('OPS-P6-001Y self-test must prove corruption rejection.');
}
if (!files.executor.includes("throw new Error('secret_leakage_self_test_failed')")) {
  throw new Error('OPS-P6-001Y self-test must prove secret redaction.');
}
if (files.workflow.includes('sudo apt-get install --yes postgresql-client\n')) {
  throw new Error('OPS-P6-001Y must pin the PostgreSQL 17 client.');
}

console.log('OPS-P6-001Y configured staging P6-07 backup integrity contract passed.');
