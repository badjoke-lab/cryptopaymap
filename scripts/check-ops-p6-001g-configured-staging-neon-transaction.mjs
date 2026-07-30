import { readFileSync } from 'node:fs';

const requiredFiles = {
  workflow: '.github/workflows/ops-p6-001g-configured-staging-p6-03-neon-transaction.yml',
  procedure: 'docs/OPS_P6_001G_CONFIGURED_STAGING_P6_03_NEON_TRANSACTION.md',
  executor: 'scripts/run-ops-p6-001g-configured-staging-neon-transaction.ts',
  authorization: '.github/workflows/ops-p6-001c-configured-staging-authorization.yml',
};

const files = Object.fromEntries(
  Object.entries(requiredFiles).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
);

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_03'],
  [files.workflow, 'p6-03-neon-transaction-receipt.json'],
  [files.workflow, 'DATABASE_URL: ${{ secrets.DATABASE_URL }}'],
  [files.workflow, 'Enforce configured P6-03 acceptance'],
  [files.procedure, 'Injected failure and rollback'],
  [files.procedure, 'Publication separation'],
  [files.procedure, 'fixture exists only to prove the actual database transaction boundary'],
  [files.executor, 'pg_advisory_xact_lock'],
  [files.executor, 'locationProfileCorrectionDecisions'],
  [files.executor, 'application_committed'],
  [files.executor, 'select 1 / 0 as injected_failure'],
  [files.executor, "visibility: 'hidden'"],
  [files.executor, 'cleanupFixture'],
  [files.executor, 'predecessor_binding:mismatch'],
  [files.authorization, 'OPS-P6-001G configured staging P6-03 Neon transaction'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001G contract marker is missing: ${marker}`);
  }
}

const forbiddenRepositoryMarkers = [
  'postgresql://',
  'CPM_REVIEW_SECRET_SEED_BASE64URL=',
  'DATABASE_URL=',
  'private submission payload fixture',
];
for (const [name, content] of Object.entries(files)) {
  for (const marker of forbiddenRepositoryMarkers) {
    if (content.includes(marker)) {
      throw new Error(`OPS-P6-001G ${name} contains forbidden retained material: ${marker}`);
    }
  }
}

console.log('OPS-P6-001G configured staging Neon transaction contract check passed.');
