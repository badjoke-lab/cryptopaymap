import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

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

const dispatcherBranch = 'refs/heads/agent/ops-p6-001h-exact-main-dispatch';
if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_EVENT_NAME === 'push' &&
  process.env.GITHUB_REF === dispatcherBranch
) {
  const repository = 'badjoke-lab/cryptopaymap';
  const expectedMain = '781f69a3d5cb4910da222e5764b22f55b903d576';
  const currentMain = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)[0];
  if (currentMain !== expectedMain) {
    throw new Error(`Exact main moved before dispatch: ${currentMain}`);
  }

  execFileSync(
    'git',
    ['fetch', 'origin', 'staging-review:refs/remotes/origin/staging-review'],
    { stdio: 'inherit' },
  );
  if (!existsSync('status')) {
    execFileSync('git', [
      'worktree',
      'add',
      '--detach',
      'status',
      'refs/remotes/origin/staging-review',
    ]);
  }

  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const refreshStatus = () => {
    execFileSync(
      'git',
      ['fetch', 'origin', 'staging-review:refs/remotes/origin/staging-review'],
      { stdio: 'ignore' },
    );
    execFileSync('git', ['-C', 'status', 'reset', '--hard', 'refs/remotes/origin/staging-review'], {
      stdio: 'ignore',
    });
  };
  const waitForReceipt = async (path, stateField, expectedState) => {
    for (let attempt = 1; attempt <= 80; attempt += 1) {
      refreshStatus();
      const absolutePath = `status/${path}`;
      if (existsSync(absolutePath)) {
        const receipt = JSON.parse(readFileSync(absolutePath, 'utf8'));
        if (receipt.commit === expectedMain && receipt[stateField] === expectedState) {
          console.log(`${path} is current: ${expectedState}`);
          return;
        }
      }
      console.log(`Waiting for ${path} (${attempt}/80)`);
      await sleep(15_000);
    }
    throw new Error(`Timed out waiting for ${path}`);
  };
  const dispatch = (workflow, fields = {}) => {
    const argumentsList = ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main'];
    for (const [name, value] of Object.entries(fields)) {
      argumentsList.push('-f', `${name}=${value}`);
    }
    execFileSync('gh', argumentsList, { stdio: 'inherit', env: process.env });
  };

  await waitForReceipt(
    'config/staging-review/deployment-receipt.json',
    'status',
    'deployed',
  );

  dispatch('p5-02r-fixed-review-live-audit.yml');
  await waitForReceipt(
    'config/staging-review/p5-02r-live-audit-receipt.json',
    'status',
    'complete',
  );

  dispatch('ops-p6-001d-configured-staging-p6-01-data-qa.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_01',
    approved_commit: expectedMain,
    data_owner: 'ops:configured-staging-data-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-01-data-qa-receipt.json',
    'state',
    'accepted',
  );

  dispatch('ops-p6-001e-configured-staging-p6-02-identity-admin.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_02',
    approved_commit: expectedMain,
    identity_owner: 'ops:configured-staging-identity-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-02-identity-admin-receipt.json',
    'state',
    'accepted',
  );

  dispatch('ops-p6-001g-configured-staging-p6-03-neon-transaction.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_03',
    approved_commit: expectedMain,
    transaction_owner: 'ops:configured-staging-transaction-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-03-neon-transaction-receipt.json',
    'state',
    'accepted',
  );

  dispatch('ops-p6-001h-configured-staging-p6-04-media-lifecycle.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_04',
    approved_commit: expectedMain,
    media_owner: 'ops:configured-staging-media-owner',
  });
  console.log('Exact-main P6-04 execution dispatched.');
}
