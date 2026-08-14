import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync(
    'scripts/run-ops-p6-014-production-candidate-bootstrap.mjs',
    'utf8',
  ).toLowerCase(),
  workflow: readFileSync(
    '.github/workflows/ops-p6-014-configured-production-candidate-bootstrap.yml',
    'utf8',
  ).toLowerCase(),
  doc: readFileSync(
    'docs/OPS_P6_014_CONFIGURED_PRODUCTION_CANDIDATE_BOOTSTRAP.md',
    'utf8',
  ).toLowerCase(),
  machine: readFileSync('scripts/materialize-production-machine-files.mjs', 'utf8').toLowerCase(),
  machineDoc: readFileSync(
    'docs/OPS_P6_021_PRODUCTION_MACHINE_READABLE_FILES.md',
    'utf8',
  ).toLowerCase(),
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
  "['/admin/', 403, 'text/plain']",
  'admin_access_cache_policy_missing',
  "method: 'get'",
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'bootstrap_configured_production_candidate',
  'inspect protected production environment before mutation',
  'environment: production',
  'cryptopaymap-production',
  'wrangler pages project create',
  'wrangler pages secret bulk',
  'wrangler pages deploy',
  '--branch main',
  'p6_08_production_database_url',
  'p6_08_production_review_secret_seed_base64url',
  'p6_08_production_turnstile_secret_key',
  'p6_08_production_turnstile_site_key',
  'p6_08_production_cf_access_team_domain',
  'p6_08_production_cf_access_aud',
  "cpm_turnstile_expected_hostname: 'www.cryptopaymap.com'",
  'cpm_admin_auth_mode',
  'cloudflare_access',
  'cf_access_team_domain',
  'cf_access_aud',
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
  'cloudflare access',
  'unauthenticated',
  'canonical `www.cryptopaymap.com`',
  '`/admin/`',
  '403',
]);

expectIncludes('runner', files.runner, [
  'p6_08_production_credential_generation_id',
  'credentialgenerationdigest',
  'productionturnstilehostname',
]);
expectIncludes('workflow', files.workflow, ['p6_08_production_credential_generation_id']);

expectIncludes('runner', files.runner, [
  'materializeproductionmachinefiles',
  "['/llms.txt', 200, 'text/plain']",
  "['/ai.txt', 200, 'text/plain']",
  "['/sitemap.xml', 200, 'application/xml']",
  'external_robots_contract_mismatch',
  'external_llms_contract_mismatch',
  'external_ai_contract_mismatch',
  'external_sitemap_contract_mismatch',
]);
expectIncludes('machine materializer', files.machine, [
  'robots.txt',
  'llms.txt',
  'ai.txt',
  'sitemap.xml',
  'disallow: /admin/',
  'reviewed public records only',
  "!route.startswith('/admin/')",
]);
expectIncludes('machine documentation', files.machineDoc, [
  'production machine-readable launch files',
  '`/robots.txt`',
  '`/llms.txt`',
  '`/ai.txt`',
  '`/sitemap.xml`',
  'staging:review:build',
  'global `disallow: /`',
  'candidate records',
]);

console.log('OPS-P6-014 configured production candidate bootstrap contract passed.');
