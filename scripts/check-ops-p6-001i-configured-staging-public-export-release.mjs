import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001i-configured-staging-p6-05-public-export-release.yml',
    'utf8',
  ),
  procedure: readFileSync(
    'docs/OPS_P6_001I_CONFIGURED_STAGING_P6_05_PUBLIC_EXPORT_RELEASE.md',
    'utf8',
  ),
  executor: readFileSync(
    'scripts/run-ops-p6-001i-configured-staging-public-export-release.mjs',
    'utf8',
  ),
  repositoryContract: readFileSync(
    'scripts/check-p6-05-configured-public-export-release-evidence.js',
    'utf8',
  ),
  deployment: readFileSync('.github/workflows/staging-review-deploy.yml', 'utf8'),
  publication: readFileSync('src/admin/export-release/publication-contract.ts', 'utf8'),
  activation: readFileSync('src/admin/export-release/activation-r2.ts', 'utf8'),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_05'],
  [files.workflow, 'p6-05-public-export-release-receipt.json'],
  [files.workflow, 'Enforce configured P6-05 acceptance'],
  [files.workflow, 'CLOUDFLARE_API_TOKEN'],
  [files.workflow, 'CLOUDFLARE_ACCOUNT_ID'],
  [files.procedure, 'production branch: `staging-review`'],
  [files.procedure, 'Preview deployments are never rollback targets.'],
  [files.procedure, 'Leave the exact candidate active'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'"],
  [files.executor, "const productionBranch = 'staging-review'"],
  [files.executor, "const productionBaseUrl = 'https://cryptopaymap-staging.pages.dev'"],
  [files.executor, "const markerPath = '/p6-05-release.json'"],
  [files.executor, "cloudflareRequest(`/deployments/${deploymentId}/rollback`"],
  [files.executor, 'unrecognized_production_deployment'],
  [files.executor, "execFileSync('npm', ['run', 'staging:review:build']"],
  [files.executor, 'candidateRestored: true'],
  [files.repositoryContract, 'P6-05 configured public export and release evidence contract passed.'],
  [files.deployment, '--branch review'],
  [files.publication, "state: 'published' | 'replayed'"],
  [files.activation, 'pointer_conflict'],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001I contract marker is missing: ${marker}`);
  }
}

const forbidden = [
  'postgresql://',
  'CLOUDFLARE_API_TOKEN=',
  'CLOUDFLARE_ACCOUNT_ID=',
  'X-Auth-Key:',
  'X-Amz-Signature=',
  'cryptopaymap.com',
];
for (const [name, content] of Object.entries(files)) {
  for (const marker of forbidden) {
    if (content.includes(marker)) {
      throw new Error(`OPS-P6-001I ${name} contains forbidden material: ${marker}`);
    }
  }
}

if (/--branch\s+review\b/.test(files.executor)) {
  throw new Error('OPS-P6-001I executor must not treat the review preview branch as production.');
}
if (!files.executor.includes("project?.production_branch === productionBranch")) {
  throw new Error('OPS-P6-001I executor must fail closed on the Pages production branch.');
}
if (!files.executor.includes('customDomains.length === 0')) {
  throw new Error('OPS-P6-001I executor must refuse custom-domain staging topology.');
}

console.log('OPS-P6-001I configured staging public export/release contract check passed.');
