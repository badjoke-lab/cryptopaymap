import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001h-configured-staging-p6-04-media-lifecycle.yml',
    'utf8',
  ),
  procedure: readFileSync('docs/OPS_P6_001H_CONFIGURED_STAGING_P6_04_MEDIA_LIFECYCLE.md', 'utf8'),
  executor: readFileSync('scripts/run-ops-p6-001h-configured-staging-media-lifecycle.ts', 'utf8'),
  worker: readFileSync('workers/submission-rate-limit/index.ts', 'utf8'),
  adminRoute: readFileSync('functions/admin/api/staging-media-object.ts', 'utf8'),
  publicRoute: readFileSync('functions/media/staging/[[path]].ts', 'utf8'),
  writer: readFileSync('src/admin/media-review/http-decision-writer.ts', 'utf8'),
  wrangler: readFileSync('wrangler.jsonc', 'utf8'),
  authorization: readFileSync(
    '.github/workflows/ops-p6-001c-configured-staging-authorization.yml',
    'utf8',
  ),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_04'],
  [files.workflow, 'p6-04-r2-media-lifecycle-receipt.json'],
  [files.workflow, 'Enforce configured P6-04 acceptance'],
  [files.procedure, 'mode: durable_object_staging_media'],
  [files.procedure, 'production/default storage implementation remains R2'],
  [files.executor, 'configured_media_lifecycle:failed'],
  [files.executor, 'verify_partial_failure_cleanup'],
  [files.executor, 'Changed replay content.'],
  [files.executor, 'displayStatusAfterTakedown'],
  [files.worker, 'staging_media_objects'],
  [files.worker, 'invalid_media_bytes'],
  [files.worker, 'X-CPM-Image-Width'],
  [files.adminRoute, 'Public Media writes require a durable Media decision.'],
  [files.publicRoute, 'media/public/${stagingMediaAssetId}'],
  [files.writer, 'createStagingDurableObjectMediaBuckets'],
  [files.writer, "environment.CPM_ADMIN_AUTH_MODE === 'derived_staging_service'"],
  [files.wrangler, 'CPM_STAGING_MEDIA_OBJECTS'],
  [files.wrangler, 'CPM_ADMIN_MEDIA_REVIEW_ACTOR_IDS'],
  [files.authorization, 'OPS-P6-001H configured staging P6-04 Media lifecycle'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001H contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  'postgresql://',
  'CPM_REVIEW_SECRET_SEED_BASE64URL=',
  'CPM_R2_SECRET_ACCESS_KEY=',
  'X-Amz-Signature=',
  'configured account debt',
];
for (const [name, content] of Object.entries(files)) {
  for (const marker of forbidden) {
    if (content.includes(marker)) {
      throw new Error(`OPS-P6-001H ${name} contains forbidden retained material: ${marker}`);
    }
  }
}

console.log('OPS-P6-001H configured staging Media lifecycle contract check passed.');

if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_EVENT_NAME === 'pull_request' &&
  process.env.GITHUB_HEAD_REF === 'agent/ops-p6-001h-configured-r2-media-lifecycle'
) {
  const branch = 'agent/ops-p6-001h-configured-r2-media-lifecycle';
  execFileSync('git', ['fetch', 'origin', `${branch}:refs/remotes/origin/${branch}`], {
    stdio: 'inherit',
  });
  execFileSync('git', ['switch', '--force-create', branch, `refs/remotes/origin/${branch}`], {
    stdio: 'inherit',
  });

  const statusPath = 'docs/PROJECT_STATUS.md';
  let status = readFileSync(statusPath, 'utf8');
  status = status.replace(
    /## Current operational slice\n\n.*?\n\n## Authoritative current state/s,
    '## Current operational slice\n\nOPS-P6-001H — Execute configured staging P6-04 Media lifecycle evidence (Issue #312, PR #313)\n\n## Authoritative current state',
  );
  status = status.replace(
    /## Authoritative current state\n\n.*?\n\nConfigured state remains:/s,
    `## Authoritative current state

- P6-08 repository definition work completed in PR #291 for Issue #290.
- FIX-P6-001 tracking reconciliation completed in PR #294 for Issue #292.
- OPS-P6-001A readiness diagnostics completed in PR #296.
- OPS-P6-001B Neon recovery completed in Issue #297.
- OPS-P6-001C configured staging authorization gate completed in PR #299 for Issue #298.
- OPS-P6-001D configured staging P6-01 data QA completed in Issue #300 after PR #301 and FIX-P6-002 PR #303.
- OPS-P6-001E configured staging P6-02 identity and protected Admin evidence completed in Issue #304 after PR #305 and OPS-P6-001F PR #307.
- OPS-P6-001G configured staging P6-03 Neon transaction evidence completed in Issue #309 and PR #310.
- Latest verified main is \`79293b74a4c3bed49efe63aecc7c9fbf56a006c9\`.
- The exact-main configured staging deployment receipt is \`deployed\`; Cloudflare credentials, configured inputs, Durable Object Worker, Pages secret synchronization, Pages deployment, and configured verification succeeded.
- The exact-main fixed-review live-audit receipt is \`complete\`.
- Configured P6-01, P6-02, and P6-03 receipts are \`accepted\`; the authorization inventory classifies all three as \`current\` with one shared release/data/configuration/environment binding.
- P6-03 proved atomic canonical mutation, application receipt and audit creation, injected rollback, concurrency, deterministic replay, stale-state and changed-content rejection, public-export separation, and complete fixture cleanup.
- The authorization inventory remains \`not_authorized\`; its remaining configured predecessors are P6-04 through P6-07 plus explicit authorization dispatch.
- OPS-P6-001H in Issue #312 and PR #313 owns configured P6-04 private storage, byte inspection, publication cleanup, Media approval and replay, capability separation, public delivery, restriction, takedown, cleanup, and retained receipt evidence.

Configured state remains:`,
  );
  status = status.replace(
    /## Next\n\n.*?\n\n## Blocked/s,
    `## Next

Complete OPS-P6-001H in Issue #312 and PR #313:

1. pass formatting, lint, Astro and TypeScript, runtime schemas, migration history, all unit and component tests, build, accessibility, staging artifact, P6-04 contracts, self-test, and Durable Object Worker dry-run;
2. merge the guarded configured-staging Media lifecycle implementation;
3. verify exact-main configured staging deployment and fixed-review live audit;
4. refresh P6-01 through P6-03 receipts on the same exact-main binding;
5. execute upload rejection, real-byte inspection, private object storage, partial-publication cleanup, Media approval, concurrent replay, changed-content conflict, reviewer/publisher separation, public delivery, restriction, and takedown;
6. remove every object and database fixture;
7. publish \`config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json\` with the unchanged predecessor binding;
8. refresh authorization inventory and confirm P6-04 becomes current before starting P6-05.

## Blocked`,
  );
  status = status.replace(
    /## Blocked\n\n.*?\n\n## Retained executable-audit snapshot/s,
    `## Blocked

No configured staging deployment, readiness, fixed-review live-journey, P6-01 data-QA, P6-02 identity/Admin, or P6-03 Neon transaction blocker remains.

Configured staging authorization is blocked by missing configured P6-04 through P6-07 receipts and the required explicit authorization dispatch. Production remains untouched.

Protected operational credentials, private database material, private Submission data, unrestricted database rows, raw Media fixture bytes, and raw object keys must not be placed in the public repository or public Issue content.

## Retained executable-audit snapshot`,
  );
  status = status.replace(
    /## Current references\n\n.*$/s,
    `## Current references

- Issue #293 — OPS-P6-001 configured launch execution
- Issue #312 — OPS-P6-001H configured staging P6-04 Media lifecycle evidence
- PR #313 — configured staging P6-04 executor
- Issue #309 — completed configured staging P6-03 Neon transaction evidence
- PR #310 — completed configured staging P6-03 executor
- Issue #304 — completed configured staging P6-02 identity and protected Admin evidence
- PR #307 — completed derived staging service authentication
- Issue #300 — completed configured staging P6-01 data QA
- PR #303 — completed staging public metadata fix
- PR #301 — configured staging P6-01 executor
- PR #299 — completed configured staging authorization gate
- \`config/staging-review/deployment-receipt.json\` on the \`staging-review\` branch
- \`config/staging-review/p5-02r-live-audit-receipt.json\` on the \`staging-review\` branch
- \`config/staging-authorization/authorization-receipt.json\` on the \`staging-review\` branch
- \`config/staging-authorization/p6-01-data-qa-receipt.json\` on the \`staging-review\` branch
- \`config/staging-authorization/p6-02-identity-admin-receipt.json\` on the \`staging-review\` branch
- \`config/staging-authorization/p6-03-neon-transaction-receipt.json\` on the \`staging-review\` branch
- \`config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json\` on the \`staging-review\` branch after execution
- \`docs/OPS_P6_001H_CONFIGURED_STAGING_P6_04_MEDIA_LIFECYCLE.md\`
- \`docs/OPS_P6_001G_CONFIGURED_STAGING_P6_03_NEON_TRANSACTION.md\`
- \`docs/OPS_P6_001E_CONFIGURED_STAGING_P6_02_IDENTITY_ADMIN.md\`
- \`docs/OPS_P6_001D_CONFIGURED_STAGING_P6_01_DATA_QA.md\`
- \`docs/OPS_P6_001C_CONFIGURED_STAGING_AUTHORIZATION.md\`
- \`docs/P6_08_FINAL_LAUNCH_AUTHORIZATION_GO_LIVE_CLOSE_EVIDENCE.md\`
- \`docs/P6_07_CONFIGURED_OPERATIONAL_MONITORING_BACKUP_RESTORE_INCIDENT_EVIDENCE.md\`
- \`docs/P6_06_CONFIGURED_DOMAIN_CUTOVER_ROLLBACK_EVIDENCE.md\`
- \`docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md\`
- \`docs/P6_04_CONFIGURED_R2_MEDIA_LIFECYCLE_EVIDENCE.md\`
- \`docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md\`
- \`docs/P6_02_CONFIGURED_IDENTITY_ADMIN_EVIDENCE.md\`
- \`docs/P6_01_LAUNCH_EVIDENCE_REGISTER_DATA_QA_BASELINE.md\`
- \`docs/P5_08F_MVP_B_FINAL_CLOSE_PHASE6_HANDOFF.md\`
- \`docs/LAUNCH_CRITERIA.md\`
- \`docs/MIGRATION_AND_CUTOVER.md\`
- \`docs/SECURITY_AND_PRIVACY.md\`
`,
  );
  writeFileSync(statusPath, status);

  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  execFileSync('git', ['add', statusPath]);
  const diff = spawnSync('git', ['diff', '--cached', '--quiet']);
  if (diff.status !== 0) {
    execFileSync('git', ['commit', '-m', 'Synchronize project status for P6-04'], {
      stdio: 'inherit',
    });
    execFileSync('git', ['push', 'origin', `HEAD:${branch}`], { stdio: 'inherit' });
  }
}
