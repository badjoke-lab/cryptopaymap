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
  notFoundPage: readFileSync('src/pages/404.astro', 'utf8'),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_05'],
  [files.workflow, 'p6-05-public-export-release-receipt.json'],
  [files.workflow, 'Enforce configured P6-05 acceptance'],
  [files.workflow, 'CLOUDFLARE_API_TOKEN'],
  [files.workflow, 'CLOUDFLARE_ACCOUNT_ID'],
  [files.workflow, "'src/pages/404.astro'"],
  [files.procedure, 'production branch: `staging-review`'],
  [files.procedure, 'exact project platform hostname: `cryptopaymap-staging.pages.dev`'],
  [files.procedure, 'exactly `staging.cryptopaymap.com` may remain attached'],
  [files.procedure, 'Every other hostname remains disallowed and fails closed.'],
  [files.procedure, 'Preview deployments are never rollback targets.'],
  [files.procedure, 'top-level `404.html`'],
  [files.procedure, 'authenticated historical release'],
  [files.procedure, 'Historical releases are never reused'],
  [files.procedure, 'Leave the exact candidate active'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_05'"],
  [files.executor, "const productionBranch = 'staging-review'"],
  [files.executor, "const productionBaseUrl = 'https://cryptopaymap-staging.pages.dev'"],
  [files.executor, "const approvedStagingCustomDomain = 'staging.cryptopaymap.com'"],
  [files.executor, 'const priorP606ReceiptPath ='],
  [
    files.executor,
    "'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'",
  ],
  [files.executor, "const markerPath = '/p6-05-release.json'"],
  [files.executor, 'cloudflareRequest(`/deployments/${deploymentId}/rollback`'],
  [files.executor, 'unrecognized_production_deployment'],
  [files.executor, "execFileSync('npm', ['run', 'staging:review:build']"],
  [files.executor, 'const platformDomain = `${projectName}.pages.dev`'],
  [files.executor, 'const platformDomainPresent = projectDomains.includes(platformDomain)'],
  [files.executor, 'const platformDomainMatches = project?.subdomain === platformDomain'],
  [files.executor, 'projectDomains.filter((domain) => domain !== platformDomain)'],
  [files.executor, 'function readPriorP606Topology(statusRoot, commit, now)'],
  [files.executor, "state: 'authenticated_prior'"],
  [files.executor, 'function evaluateProjectTopology(project, priorP606)'],
  [files.executor, 'approvedCustomDomainPresent'],
  [files.executor, 'priorP606State: priorP606.state'],
  [files.executor, 'priorP606ReceiptDigest: priorP606.digest'],
  [files.executor, 'platformDomainPresent: false'],
  [files.executor, 'platformDomainMatches: false'],
  [files.executor, "['/__p6_05_missing__', 404, 'text/html']"],
  [files.executor, 'function validP6ReleaseMarker(marker)'],
  [
    files.executor,
    'releaseMarker(marker.kind, marker.sourceCommit, marker.publicTreeDigest).releaseId',
  ],
  [files.executor, 'const historical = []'],
  [files.executor, 'historical.push({'],
  [files.executor, 'return { recognized, historical, unrecognized }'],
  [files.executor, 'historicalCount: 0'],
  [files.executor, 'historicalCount: classified.historical.length'],
  [files.executor, 'candidateRestored: true'],
  [files.executor, "activeKind: 'candidate'"],
  [files.notFoundPage, "import BaseLayout from '../layouts/BaseLayout.astro'"],
  [files.notFoundPage, 'Page not found'],
  [
    files.repositoryContract,
    'P6-05 configured public export and release evidence contract passed.',
  ],
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
if (!files.executor.includes('project?.production_branch === productionBranch')) {
  throw new Error('OPS-P6-001I executor must fail closed on the Pages production branch.');
}
if (!files.executor.includes('platformDomainPresent &&')) {
  throw new Error('OPS-P6-001I executor must require the exact Pages platform domain.');
}
if (!files.executor.includes('platformDomainMatches &&')) {
  throw new Error('OPS-P6-001I executor must require the project subdomain to match.');
}
if (!files.executor.includes('customDomains.length === 0 || authenticatedExactCustomDomain')) {
  throw new Error(
    'OPS-P6-001I executor must allow only bootstrap absence or one authenticated staging domain.',
  );
}
if (!files.executor.includes('customDomains.length === 1')) {
  throw new Error('OPS-P6-001I executor must reject extra or ambiguous custom domains.');
}
if (!files.executor.includes('customDomains[0] === approvedStagingCustomDomain')) {
  throw new Error('OPS-P6-001I executor must require the exact approved staging hostname.');
}
if (!files.executor.includes("priorP606.state === 'authenticated_prior'")) {
  throw new Error('OPS-P6-001I executor must authenticate prior P6-06 evidence.');
}
if (!files.executor.includes("receipt?.checks?.rollback?.status === 'passed'")) {
  throw new Error('OPS-P6-001I executor must require prior rollback proof.');
}
if (!files.executor.includes("receipt?.checks?.externalRollback?.status === 'passed'")) {
  throw new Error('OPS-P6-001I executor must require prior external rollback proof.');
}
if (!files.executor.includes("receipt?.checks?.finalRestore?.status === 'passed'")) {
  throw new Error('OPS-P6-001I executor must require prior final restore proof.');
}
if (!files.executor.includes('if (validP6ReleaseMarker(marker))')) {
  throw new Error('OPS-P6-001I executor must authenticate retained release markers.');
}
if (
  !files.executor.includes(
    'marker.sourceCommit === commit && marker.publicTreeDigest === treeDigest',
  )
) {
  throw new Error('OPS-P6-001I executor must separate exact-current and historical releases.');
}
if (!files.executor.includes('recognized.push(item);\n      } else {\n        historical.push({')) {
  throw new Error('OPS-P6-001I executor must not reuse historical releases as exact-current.');
}
if (!files.executor.includes("bootstrapTopology.status !== 'passed'")) {
  throw new Error('OPS-P6-001I self-test must cover the no-domain bootstrap topology.');
}
if (!files.executor.includes("authenticatedTopology.status !== 'passed'")) {
  throw new Error('OPS-P6-001I self-test must cover the authenticated staging domain.');
}
if (!files.executor.includes("unauthenticatedTopology.status !== 'failed'")) {
  throw new Error('OPS-P6-001I self-test must reject an unauthenticated custom domain.');
}
if (!files.executor.includes("extraDomainTopology.status !== 'failed'")) {
  throw new Error('OPS-P6-001I self-test must reject an additional custom domain.');
}
if (/['"]cryptopaymap\.com['"]/.test(files.executor)) {
  throw new Error('OPS-P6-001I executor must not permit the CryptoPayMap apex hostname.');
}
if (files.executor.includes('www.cryptopaymap.com')) {
  throw new Error('OPS-P6-001I executor must not permit the CryptoPayMap www hostname.');
}

console.log('OPS-P6-001I configured staging public export/release contract check passed.');
