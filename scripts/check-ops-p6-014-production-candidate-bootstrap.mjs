import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync('scripts/run-ops-p6-014-production-candidate-bootstrap.mjs', 'utf8').toLowerCase(),
  workflow: readFileSync('.github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml', 'utf8').toLowerCase(),
  doc: readFileSync('docs/OPS_P6_014_CONFIGURED_PRODUCTION_CANDIDATE_BOOTSTRAP.md', 'utf8').toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('runner', files.runner, [
  'bootstrap_configured_production_candidate',
  "projectname = 'cryptopaymap-production'",
  "stagingprojectname = 'cryptopaymap-staging'",
  "productionbranch = 'main'",
  'p6-05-public-export-release-receipt.json',
  'authorityreleaseid',
  'candidateartifactid',
  'deterministic_candidate_build_failed',
  'data/manifest.json',
  'version.json',
  'canonicalonly: true',
  'customdomains.length === 0',
  'livedomainmutation: false',
  'dnsmutation: false',
  'canonicalhostmutation: false',
  "method: 'get'",
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'bootstrap_configured_production_candidate',
  'inspect protected production environment before mutation',
  "environment: production",
  'cryptopaymap-production',
  'wrangler pages project create',
  'wrangler pages secret bulk',
  'wrangler pages deploy',
  '--branch main',
  'p6_08_production_database_url',
  'p6_08_production_review_secret_seed_base64url',
  'p6_08_production_turnstile_secret_key',
  'p6_08_production_turnstile_site_key',
  'config/production-authorization/production-candidate-bootstrap-receipt.json',
  'cryptopaymap.com',
  'do not attach live domain',
]);

expectIncludes('documentation', files.doc, [
  'production candidate',
  '`cryptopaymap-production`',
  '`cryptopaymap-staging`',
  'protected github `production` environment',
  'p6-05 candidate release',
  'candidate artifact digest',
  'does not attach `cryptopaymap.com`',
  'does not change dns',
  'does not execute cutover',
  'synthetic staging review data is not materialized',
]);

console.log('OPS-P6-014 configured production candidate bootstrap contract passed.');
