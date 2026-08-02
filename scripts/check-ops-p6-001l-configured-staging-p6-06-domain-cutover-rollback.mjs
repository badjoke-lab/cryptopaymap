import { readFileSync } from 'node:fs';

const files = {
  workflow: readFileSync(
    '.github/workflows/ops-p6-001l-configured-staging-p6-06-domain-cutover-rollback.yml',
    'utf8',
  ),
  procedure: readFileSync(
    'docs/OPS_P6_001L_CONFIGURED_STAGING_P6_06_DOMAIN_CUTOVER_ROLLBACK.md',
    'utf8',
  ),
  executor: readFileSync(
    'scripts/run-ops-p6-001l-configured-staging-p6-06-domain-cutover-rollback.mjs',
    'utf8',
  ),
  p606Contract: readFileSync(
    'scripts/check-p6-06-configured-domain-cutover-rollback-evidence.js',
    'utf8',
  ),
  authorization: readFileSync('scripts/evaluate-ops-p6-001c-staging-authorization.mjs', 'utf8'),
};

const expectations = [
  [files.workflow, 'EXECUTE_CONFIGURED_STAGING_P6_06'],
  [files.workflow, 'staging.cryptopaymap.com'],
  [files.workflow, 'P6_06_STAGING_ZONE_ID'],
  [files.workflow, 'p6-06-domain-cutover-rollback-receipt.json'],
  [files.workflow, 'Refresh configured authorization inventory'],
  [files.workflow, "if(r.state!=='accepted') process.exit(1)"],
  [files.procedure, '`staging.cryptopaymap.com`'],
  [files.procedure, 'exactly one configured staging hostname'],
  [files.procedure, 'rollback drill'],
  [files.procedure, 'independent recursive resolvers'],
  [files.procedure, 'protected Admin denial'],
  [files.procedure, 'does not authorize the apex'],
  [files.executor, "const exactConfirmation = 'EXECUTE_CONFIGURED_STAGING_P6_06'"],
  [files.executor, "const approvedHostname = 'staging.cryptopaymap.com'"],
  [files.executor, "const approvedZoneName = 'cryptopaymap.com'"],
  [files.executor, "const projectName = 'cryptopaymap-staging'"],
  [files.executor, "const productionBranch = 'staging-review'"],
  [
    files.executor,
    "const diagnosticPath = 'config/staging-authorization/p6-06-domain-topology-diagnostic.json'",
  ],
  [
    files.executor,
    "const acceptedReceiptPath = 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json'",
  ],
  [files.executor, "receipt?.decision === 'no_candidate'"],
  [files.executor, "receipt?.checks?.permissions?.dnsList === 'success'"],
  [files.executor, 'prestate_changed_before_mutation'],
  [files.executor, 'pages_domain_add'],
  [files.executor, 'dns_record_create'],
  [files.executor, 'pages_domain_delete'],
  [files.executor, 'dns_record_delete'],
  [files.executor, 'rollbackOwnedToAbsent'],
  [files.executor, 'establishFinalTopology'],
  [files.executor, 'queryDoh'],
  [files.executor, 'authoritativeObservation'],
  [files.executor, 'tlsObservation'],
  [files.executor, 'http_redirect_invalid'],
  [files.executor, 'canonical_host_mismatch'],
  [files.executor, 'active_release_identity_mismatch'],
  [files.executor, "['/admin/api/dashboard', 403, 'text/plain']"],
  [files.executor, 'bestEffortRollback'],
  [files.executor, "launchDomain: 'domain_cutover_rollback'"],
  [
    files.executor,
    "state: state === 'accepted' && exceptions.length === 0 ? 'accepted' : 'failed'",
  ],
  [files.p606Contract, 'P6-06 configured domain cutover and rollback evidence contract passed.'],
  [
    files.authorization,
    "['P6-06', 'config/staging-authorization/p6-06-domain-cutover-rollback-receipt.json']",
  ],
];

for (const [content, marker] of expectations) {
  if (!content.includes(marker))
    throw new Error(`OPS-P6-001L contract marker is missing: ${marker}`);
}

const forbidden = [
  'cryptopaymap.com/pages/projects',
  "const approvedHostname = 'cryptopaymap.com'",
  "const approvedHostname = 'www.cryptopaymap.com'",
  '/purge_cache',
  '/purge_build_cache',
  "method: 'PATCH'",
  'method: "PATCH"',
  "method: 'PUT'",
  'method: "PUT"',
  'registrar',
  'CLOUDFLARE_API_TOKEN=',
  'CLOUDFLARE_ACCOUNT_ID=',
  'P6_06_STAGING_ZONE_ID=',
];
for (const marker of forbidden) {
  if (files.executor.includes(marker))
    throw new Error(`OPS-P6-001L executor contains forbidden marker: ${marker}`);
}

if (!files.executor.includes("method: 'POST'"))
  throw new Error('OPS-P6-001L must contain bounded create mutations.');
if (!files.executor.includes("method: 'DELETE'"))
  throw new Error('OPS-P6-001L must contain bounded rollback mutations.');
if (!files.executor.includes("predecessors.every((item) => item.state === 'current')"))
  throw new Error('OPS-P6-001L must require current P6-01 through P6-05 receipts.');
if (!files.executor.includes("cache: 'no-store'"))
  throw new Error('OPS-P6-001L provider and external checks must bypass caches.');
if (!files.executor.includes("classifySnapshot(initial) !== 'absent'"))
  throw new Error('OPS-P6-001L must stop on a changed pre-state.');
if (!files.executor.includes("classifySnapshot(initial) === 'final_active'"))
  throw new Error('OPS-P6-001L duplicate execution must require the exact final topology.');
if (!files.executor.includes('raw hostname must not be retained in provider snapshot'))
  throw new Error('OPS-P6-001L self-test must prove provider snapshots are redacted.');

console.log('OPS-P6-001L configured staging P6-06 guarded cutover/rollback contract passed.');
