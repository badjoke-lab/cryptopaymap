import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const repository = 'badjoke-lab/cryptopaymap';
const expectedMain = 'ef8af56ba7aff57ce5f40a336c476cf452a39092';
const dispatcherRef = 'refs/heads/agent/fix-p6-003-exact-main-dispatch';
const statusDirectory = 'status';

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function currentMain() {
  return execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\s+/)[0];
}

function refreshStatus() {
  execFileSync(
    'git',
    ['fetch', 'origin', 'staging-review:refs/remotes/origin/staging-review'],
    { stdio: 'ignore' },
  );
  if (!existsSync(statusDirectory)) {
    execFileSync('git', [
      'worktree',
      'add',
      '--detach',
      statusDirectory,
      'refs/remotes/origin/staging-review',
    ]);
    return;
  }
  execFileSync(
    'git',
    ['-C', statusDirectory, 'reset', '--hard', 'refs/remotes/origin/staging-review'],
    { stdio: 'ignore' },
  );
}

function readStatusReceipt(path) {
  refreshStatus();
  const absolutePath = `${statusDirectory}/${path}`;
  if (!existsSync(absolutePath)) return null;
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    return null;
  }
}

async function waitForReceipt(path, predicate, label, attempts = 120) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const receipt = readStatusReceipt(path);
    if (receipt !== null && predicate(receipt)) {
      console.log(`${label} is current.`);
      return receipt;
    }
    console.log(`Waiting for ${label} (${attempt}/${attempts})`);
    await sleep(15_000);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function dispatch(workflow, fields = {}) {
  const argumentsList = ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main'];
  for (const [name, value] of Object.entries(fields)) {
    argumentsList.push('-f', `${name}=${value}`);
  }
  execFileSync('gh', argumentsList, { stdio: 'inherit', env: process.env });
}

function p6Current(receipt, evidenceId) {
  return (
    receipt?.commit === expectedMain &&
    receipt?.state === 'accepted' &&
    receipt?.evidenceId === evidenceId
  );
}

function inventoryCurrent(receipt) {
  const predecessors = receipt?.checks?.predecessors;
  const p604 = Array.isArray(predecessors)
    ? predecessors.find((item) => item?.evidenceId === 'P6-04')
    : null;
  return (
    receipt?.approvedCommit === expectedMain &&
    receipt?.mode === 'inventory' &&
    receipt?.state === 'not_authorized' &&
    p604?.state === 'current'
  );
}

function publishInventoryReceipt() {
  refreshStatus();
  const outputPath = 'configured-staging-authorization-receipt.json';
  execFileSync(
    'node',
    ['scripts/evaluate-ops-p6-001c-staging-authorization.mjs', statusDirectory, outputPath],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        APPROVED_COMMIT: expectedMain,
        CONFIRMATION: 'AUTHORIZE_CONFIGURED_STAGING',
        LAUNCH_OWNER: 'inventory:fix-p6-003-dispatcher',
        OBSERVER: 'inventory:unassigned-observer',
        ROLLBACK_OWNER: 'inventory:unassigned-rollback-owner',
        EVALUATION_MODE: 'inventory',
        WORKFLOW_RUN_ID: process.env.GITHUB_RUN_ID ?? '0',
      },
    },
  );
  const receipt = JSON.parse(readFileSync(outputPath, 'utf8'));
  if (!inventoryCurrent(receipt)) {
    throw new Error('The refreshed authorization inventory did not classify P6-04 as current.');
  }
  const destinationDirectory = `${statusDirectory}/config/staging-authorization`;
  mkdirSync(destinationDirectory, { recursive: true });
  writeFileSync(
    `${destinationDirectory}/authorization-receipt.json`,
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  execFileSync('git', ['-C', statusDirectory, 'config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', [
    '-C',
    statusDirectory,
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  execFileSync('git', [
    '-C',
    statusDirectory,
    'add',
    'config/staging-authorization/authorization-receipt.json',
  ]);
  try {
    execFileSync('git', ['-C', statusDirectory, 'diff', '--cached', '--quiet']);
  } catch {
    execFileSync(
      'git',
      ['-C', statusDirectory, 'commit', '-m', 'Refresh configured staging authorization inventory'],
      { stdio: 'inherit' },
    );
    execFileSync('git', ['-C', statusDirectory, 'push', 'origin', 'HEAD:staging-review'], {
      stdio: 'inherit',
    });
  }
  return receipt;
}

if (
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_EVENT_NAME === 'push' &&
  process.env.GITHUB_REF === dispatcherRef
) {
  if (currentMain() !== expectedMain) {
    throw new Error(`Exact main moved before FIX-P6-003 dispatch: ${currentMain()}`);
  }

  dispatch('staging-review-deploy.yml');
  await waitForReceipt(
    'config/staging-review/deployment-receipt.json',
    (receipt) => receipt?.commit === expectedMain && receipt?.status === 'deployed',
    'exact-main staging deployment',
  );

  dispatch('p5-02r-fixed-review-live-audit.yml');
  await waitForReceipt(
    'config/staging-review/p5-02r-live-audit-receipt.json',
    (receipt) => receipt?.commit === expectedMain && receipt?.status === 'complete',
    'exact-main fixed-review live audit',
  );

  dispatch('ops-p6-001d-configured-staging-p6-01-data-qa.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_01',
    approved_commit: expectedMain,
    data_owner: 'ops:fix-p6-003-data-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-01-data-qa-receipt.json',
    (receipt) => p6Current(receipt, 'P6-01'),
    'exact-main P6-01',
  );

  dispatch('ops-p6-001e-configured-staging-p6-02-identity-admin.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_02',
    approved_commit: expectedMain,
    identity_owner: 'ops:fix-p6-003-identity-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-02-identity-admin-receipt.json',
    (receipt) => p6Current(receipt, 'P6-02'),
    'exact-main P6-02',
  );

  dispatch('ops-p6-001g-configured-staging-p6-03-neon-transaction.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_03',
    approved_commit: expectedMain,
    transaction_owner: 'ops:fix-p6-003-transaction-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-03-neon-transaction-receipt.json',
    (receipt) => p6Current(receipt, 'P6-03'),
    'exact-main P6-03',
  );

  dispatch('ops-p6-001h-configured-staging-p6-04-media-lifecycle.yml', {
    confirmation: 'EXECUTE_CONFIGURED_STAGING_P6_04',
    approved_commit: expectedMain,
    media_owner: 'ops:fix-p6-003-media-owner',
  });
  await waitForReceipt(
    'config/staging-authorization/p6-04-r2-media-lifecycle-receipt.json',
    (receipt) => p6Current(receipt, 'P6-04'),
    'exact-main P6-04',
  );

  let inventory = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    inventory = readStatusReceipt('config/staging-authorization/authorization-receipt.json');
    if (inventoryCurrent(inventory)) break;
    console.log(`Waiting for automatic inventory refresh (${attempt}/12)`);
    await sleep(10_000);
  }
  if (!inventoryCurrent(inventory)) inventory = publishInventoryReceipt();
  if (!inventoryCurrent(inventory)) {
    throw new Error('P6-04 is not current in configured staging authorization inventory.');
  }
  console.log('FIX-P6-003 exact-main sequence completed through P6-04 current inventory.');
}
