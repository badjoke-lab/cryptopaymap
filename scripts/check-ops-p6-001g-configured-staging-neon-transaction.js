import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [workflow, script, documentation, evidenceContract, authorizationWorkflow] =
  await Promise.all([
    readFile(
      '.github/workflows/ops-p6-001g-configured-staging-p6-03-neon-transaction.yml',
      'utf8',
    ),
    readFile('scripts/run-ops-p6-001g-configured-staging-neon-transaction.ts', 'utf8'),
    readFile('docs/OPS_P6_001G_CONFIGURED_STAGING_P6_03_NEON_TRANSACTION.md', 'utf8'),
    readFile('docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md', 'utf8'),
    readFile('.github/workflows/ops-p6-001c-configured-staging-authorization.yml', 'utf8'),
  ]);

for (const marker of [
  'EXECUTE_CONFIGURED_STAGING_P6_03',
  'DATABASE_URL',
  'Verify exact current main',
  'Publish configured P6-03 receipt to status branch',
  'p6-03-neon-transaction-receipt.json',
]) {
  assert.ok(workflow.includes(marker), `OPS-P6-001G workflow marker missing: ${marker}`);
}

for (const marker of [
  'createDrizzleCandidatePromotionBackend',
  'createCandidatePromotionService',
  'candidate_resolution',
  'location_field_correction',
  'relationship_replacement',
  'business_claim_payment',
  'photos_media_binding',
  'rolled_back_conflict',
  'activationCountBefore',
  'fixture_cleanup:failed',
]) {
  assert.ok(script.includes(marker), `OPS-P6-001G script marker missing: ${marker}`);
}

for (const forbidden of [
  'console.log(databaseUrl',
  'connectionString',
  'raw database dump',
  'process.env.DATABASE_URL)',
]) {
  assert.ok(!script.includes(forbidden), `OPS-P6-001G unsafe marker present: ${forbidden}`);
}

for (const marker of [
  'five-class fail-closed rule',
  'exact replay returns the durable prior receipt',
  'complete atomic batch rolls back',
  'all fixture rows are removed',
]) {
  assert.ok(
    documentation.toLowerCase().includes(marker.toLowerCase()),
    `OPS-P6-001G documentation marker missing: ${marker}`,
  );
}

assert.ok(
  evidenceContract.includes('Configured staging evidence: `unproven`.'),
  'P6-03 configured staging contract was weakened.',
);
assert.ok(
  authorizationWorkflow.includes('OPS-P6-001G configured staging P6-03 Neon transaction'),
  'Authorization inventory does not observe the configured P6-03 executor.',
);

console.log('OPS-P6-001G configured Neon transaction contract passed.');
