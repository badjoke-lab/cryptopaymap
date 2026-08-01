import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001j-configured-staging-p6-06-domain-topology-diagnostic.yml',
    'utf8',
  ),
  procedure: readFileSync(
    'docs/OPS_P6_001J_CONFIGURED_STAGING_P6_06_DOMAIN_TOPOLOGY_DIAGNOSTIC.md',
    'utf8',
  ),
  executor: readFileSync(
    'scripts/run-ops-p6-001j-configured-staging-p6-06-domain-topology-diagnostic.mjs',
    'utf8',
  ),
  p606Contract: readFileSync(
    'scripts/check-p6-06-configured-domain-cutover-rollback-evidence.js',
    'utf8',
  ),
  authorization: readFileSync('scripts/evaluate-ops-p6-001c-staging-authorization.mjs', 'utf8'),
};

const expectations = [
  [files.workflow, 'DIAGNOSE_CONFIGURED_STAGING_P6_06'],
  [files.workflow, 'p6-06-domain-topology-diagnostic.json'],
  [files.workflow, 'CLOUDFLARE_API_TOKEN'],
  [files.workflow, 'CLOUDFLARE_ACCOUNT_ID'],
  [files.workflow, 'Enforce completed read-only diagnostic'],
  [files.procedure, 'This diagnostic is not P6-06 acceptance evidence.'],
  [files.procedure, 'It must not create, update, delete, bind, activate, purge, roll back'],
  [files.procedure, '`existing_candidate_requires_approval`'],
  [files.procedure, '`permission_blocked`'],
  [files.procedure, '`unsafe_topology`'],
  [files.procedure, 'p6-06-domain-topology-diagnostic.json'],
  [files.executor, "const exactConfirmation = 'DIAGNOSE_CONFIGURED_STAGING_P6_06'"],
  [files.executor, "const evidenceId = 'P6-06-DIAGNOSTIC'"],
  [files.executor, "const projectName = 'cryptopaymap-staging'"],
  [files.executor, "const productionBranch = 'staging-review'"],
  [
    files.executor,
    "['P6-05', 'config/staging-authorization/p6-05-public-export-release-receipt.json']",
  ],
  [files.executor, "cloudflareRequest('/user/tokens/verify', 'token_verify')"],
  [files.executor, '/pages/projects/${projectName}'],
  [files.executor, 'listZones(accountId)'],
  [files.executor, 'listDnsRecords(zone.id)'],
  [files.executor, "decision = 'existing_candidate_requires_approval'"],
  [files.executor, "decision = 'no_candidate'"],
  [files.executor, "decision = 'permission_blocked'"],
  [files.executor, "decision = 'unsafe_topology'"],
  [files.executor, "state = 'diagnosed'"],
  [files.executor, 'candidateDigest: boundedHash'],
  [files.executor, 'deploymentDigest: boundedHash'],
  [files.executor, 'raw hostname must not be retained'],
  [files.p606Contract, 'P6-06 configured domain cutover and rollback evidence contract passed.'],
  [
    files.authorization,
    "['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json']",
  ],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker)) {
    throw new Error(`OPS-P6-001J contract marker is missing: ${marker}`);
  }
}

const forbiddenExecutorMarkers = [
  "method: 'POST'",
  'method: "POST"',
  "method: 'PUT'",
  'method: "PUT"',
  "method: 'PATCH'",
  'method: "PATCH"',
  "method: 'DELETE'",
  'method: "DELETE"',
  '/rollback',
  '/purge_cache',
  '/domains/',
  '/dns_records/',
];
for (const marker of forbiddenExecutorMarkers) {
  if (files.executor.includes(marker)) {
    throw new Error(`OPS-P6-001J executor contains a mutation marker: ${marker}`);
  }
}

const forbiddenRetainedMarkers = [
  'accountId:',
  'zoneId:',
  'recordId:',
  'rawHostname:',
  'rawZoneName:',
  'CLOUDFLARE_API_TOKEN=',
  'CLOUDFLARE_ACCOUNT_ID=',
];
for (const marker of forbiddenRetainedMarkers) {
  if (files.executor.includes(marker)) {
    throw new Error(`OPS-P6-001J executor contains forbidden retained material: ${marker}`);
  }
}

if (files.workflow.includes('p6-06-domain-cutover-rollback-receipt.json')) {
  throw new Error('OPS-P6-001J diagnostic must not publish the accepted P6-06 receipt path.');
}
if (!files.executor.includes("cache: 'no-store'")) {
  throw new Error('OPS-P6-001J provider reads must bypass response caches.');
}
if (!files.executor.includes("predecessors.every((item) => item.state === 'current')")) {
  throw new Error('OPS-P6-001J must require current P6-01 through P6-05 receipts.');
}

console.log('OPS-P6-001J configured staging P6-06 topology diagnostic contract passed.');
