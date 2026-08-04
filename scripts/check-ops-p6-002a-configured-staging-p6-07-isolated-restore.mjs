import { readFileSync } from 'node:fs';

const paths = {
  workflow: '.github/workflows/ops-p6-002a-configured-staging-p6-07-isolated-restore.yml',
  docs: 'docs/OPS_P6_002A_CONFIGURED_STAGING_P6_07_ISOLATED_RESTORE.md',
  executor: 'scripts/run-ops-p6-002a-configured-staging-p6-07-isolated-restore.mjs',
  checker: 'scripts/check-ops-p6-002a-configured-staging-p6-07-isolated-restore.mjs',
  evidence: 'docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md',
};
const files = Object.fromEntries(
  Object.entries(paths).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
);

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_07_Q4'],
  [files.workflow, 'actions: read'],
  [files.workflow, 'P6_07_RESTORE_DATABASE_URL: ${{ secrets.P6_07_RESTORE_DATABASE_URL }}'],
  [files.workflow, 'P6_07_BACKUP_ENCRYPTION_KEY: ${{ secrets.P6_07_BACKUP_ENCRYPTION_KEY }}'],
  [files.workflow, 'actions/download-artifact@v4'],
  [files.workflow, 'run-id: ${{ steps.q3_reference.outputs.run_id }}'],
  [files.workflow, 'github-token: ${{ secrets.GITHUB_TOKEN }}'],
  [files.workflow, 'p6-07-isolated-restore-receipt.json'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_07_Q4'"],
  [
    files.executor,
    "const q3Path = 'config/staging-authorization/p6-07-backup-integrity-receipt.json'",
  ],
  [
    files.executor,
    "const receiptPath = 'config/staging-authorization/p6-07-isolated-restore-receipt.json'",
  ],
  [files.executor, 'ops-p6-001y-configured-staging-p6-07-encrypted-backup-'],
  [files.executor, 'q3.workflowRunId'],
  [files.executor, 'createDecipheriv('],
  [files.executor, "'aes-256-gcm'"],
  [files.executor, "'--exit-on-error'"],
  [files.executor, "'--single-transaction'"],
  [files.executor, "'--no-owner'"],
  [files.executor, "'--no-privileges'"],
  [files.executor, 'targetNamePattern = /^cpm_p6_07_restore_[a-z0-9_]{4,48}$/'],
  [files.executor, "'submission_private_payload_data'"],
  [files.executor, "'submission_private_contact_data'"],
  [files.executor, 'allExpectedNonPrivateTablesMatched'],
  [files.executor, 'privateTablesZeroRows'],
  [files.executor, 'rpoObjectiveMinutes'],
  [files.executor, 'rtoObjectiveMinutes'],
  [files.executor, "immutability: 'q3_run_scoped_artifact'"],
  [files.executor, 'disposeTarget'],
  [files.executor, "receipt.state = 'accepted'"],
  [files.executor, "receipt.exceptions.push('precondition_failed')"],
  [files.executor, "throw new Error('same_database_identity_not_rejected')"],
  [files.executor, "throw new Error('non_empty_target_not_rejected')"],
  [files.executor, "throw new Error('private_rows_not_rejected')"],
  [files.executor, "throw new Error('objective_breach_not_rejected')"],
  [files.executor, "throw new Error('disposal_failure_not_rejected')"],
  [files.executor, "throw new Error('secret_leakage_self_test_failed')"],
  [files.docs, 'exact encrypted Q3 artifact'],
  [files.docs, 'non-empty, ambiguous, same-identity'],
  [files.docs, 'all-table reconciliation'],
  [files.docs, 'explicit workflow-dispatch inputs'],
  [files.docs, 'disposed in a `finally` path'],
  [files.evidence, 'A dump that has never been restored is not recovery proof.'],
];

for (const [text, expected] of expectations) {
  if (!text.includes(expected)) throw new Error(`OPS-P6-002A contract missing: ${expected}`);
}

if (!files.workflow.includes('DATABASE_URL: ${{ secrets.DATABASE_URL }}')) {
  throw new Error(
    'OPS-P6-002A must bind the fixed-review source database through a protected secret.',
  );
}
if (
  /console\.log\([^\n]*(DATABASE_URL|P6_07_RESTORE_DATABASE_URL|P6_07_BACKUP_ENCRYPTION_KEY)/.test(
    files.executor,
  )
) {
  throw new Error('OPS-P6-002A must not log protected configuration.');
}
if (/writeJson\([^\n]*(databaseUrl|restoreDatabaseUrl|encryptionKey)/.test(files.executor)) {
  throw new Error('OPS-P6-002A must not retain protected configuration values.');
}
if (!files.executor.includes("state = 'configuration_blocked'")) {
  throw new Error('OPS-P6-002A must retain an explicit configuration-blocked state.');
}
if (!files.executor.includes("throw new Error('artifact_digest_mismatch')")) {
  throw new Error('OPS-P6-002A must reject a downloaded artifact digest mismatch.');
}
if (!files.executor.includes("throw new Error('target_disposal_failed')")) {
  throw new Error('OPS-P6-002A must fail closed when isolated-target disposal fails.');
}

console.log('OPS-P6-002A configured staging P6-07 isolated restore contract passed.');
