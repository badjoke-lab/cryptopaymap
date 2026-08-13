import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync(
    'scripts/run-ops-p6-013-production-readiness-diagnostic.mjs',
    'utf8',
  ).toLowerCase(),
  workflow: readFileSync(
    '.github/workflows/ops-p6-013-configured-production-readiness-diagnostic.yml',
    'utf8',
  ).toLowerCase(),
  doc: readFileSync(
    'docs/OPS_P6_013_CONFIGURED_PRODUCTION_READINESS_DIAGNOSTIC.md',
    'utf8',
  ).toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('runner', files.runner, [
  'diagnose_configured_production_readiness',
  "productionproject = 'cryptopaymap-production'",
  "stagingproject = 'cryptopaymap-staging'",
  'p6-05-public-export-release-receipt.json',
  'p6-05-release.json',
  'github_environment:production_missing',
  'github_environment:protection_missing',
  'p6_08_production_database_url',
  'p6_08_production_review_secret_seed_base64url',
  'p6_08_production_turnstile_secret_key',
  'p6_08_production_turnstile_site_key',
  'p6_08_production_cf_access_team_domain',
  'p6_08_production_cf_access_aud',
  'admin_access:not_enforced',
  '/admin/',
  'pages_project:missing_or_inaccessible',
  'production_dns:missing',
  'intended_release:not_observed',
  'productionmutation: false',
  "method = 'get'",
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'diagnose_configured_production_readiness',
  'verify exact current main',
  'inspect github production environment read-only',
  "node --input-type=module <<'node'",
  "method: 'get'",
  'production_environment_status',
  'production_environment_protection_count',
  'production-readiness-diagnostic.json',
  'config/production-authorization/readiness-diagnostic.json',
  "if(r.decision!=='ready')",
  'contents: write',
]);

expectIncludes('documentation', files.doc, [
  'read-only',
  '`cryptopaymap-production`',
  '`cryptopaymap-staging`',
  'github `production` environment',
  'protection rule',
  'p6-05 candidate release',
  'production-specific runtime inputs',
  'cloudflare access',
  'unauthenticated',
  '`/admin/`',
  '403',
  'does not create the production pages project',
  'does not attach the production domain',
  'does not change dns',
  'production mutation: none',
]);

expectIncludes('runner', files.runner, [
  'p6_08_production_credential_generation_id',
  'credentialgenerationdigest',
  'credential_generation:invalid',
]);
expectIncludes('workflow', files.workflow, ['p6_08_production_credential_generation_id']);

console.log('OPS-P6-013 configured production readiness diagnostic contract passed.');
