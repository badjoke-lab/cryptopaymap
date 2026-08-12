import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync('scripts/run-ops-p6-016-production-go-live-executor.mjs', 'utf8').toLowerCase(),
  workflow: readFileSync('.github/workflows/ops-p6-016-configured-production-go-live.yml', 'utf8').toLowerCase(),
  doc: readFileSync('docs/OPS_P6_016_CONFIGURED_PRODUCTION_GO_LIVE.md', 'utf8').toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('runner', files.runner, [
  'execute_configured_production_go_live',
  "evidenceid = 'p6-08-go-live'",
  "projectname = 'cryptopaymap-production'",
  "canonicalhost = 'www.cryptopaymap.com'",
  "apexhost = 'cryptopaymap.com'",
  "legacya = '216.198.79.1'",
  "legacywwwcname = '02eeaa61ea1e3365.vercel-dns-017.com'",
  'production-authorization/authorization-receipt.json',
  'production-candidate-bootstrap-receipt.json',
  'readiness-diagnostic.json',
  'production_authorization:not_current',
  'evidence_binding:candidate_artifact_mismatch',
  "return 'legacy_v1'",
  "'candidate_active' : 'candidate_pending'",
  'unsafe_dns_delete_candidate',
  'apex_redirect_location_mismatch',
  'candidate_release_marker_mismatch',
  'candidate_admin_not_fail_closed',
  'rollbacktolegacy',
  'establishcandidate',
  'apexmutation: false',
  'unrelateddnsmutation: false',
  'stagingmutation: false',
  'launchclosed: false',
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'execute_configured_production_go_live',
  'authorization_id',
  'execution_owner',
  'rollback_owner',
  'verify exact current main',
  'environment: production',
  'check production go-live executor contract',
  'run production go-live executor self-test',
  'production-go-live-receipt.json',
  'config/production-authorization/go-live-receipt.json',
  "if(r.state!=='accepted')",
  'contents: write',
]);

expectIncludes('documentation', files.doc, [
  'separately authorized',
  '`www.cryptopaymap.com`',
  '`cryptopaymap.com`',
  '`216.198.79.1`',
  '`02eeaa61ea1e3365.vercel-dns-017.com`',
  'apex is not mutated',
  'google verification txt',
  'exact retained vercel `www` cname',
  'same path/query',
  'candidate artifact',
  'unauthenticated admin',
  '403',
  'does not close launch',
]);

console.log('OPS-P6-016 configured production go-live executor contract passed.');
