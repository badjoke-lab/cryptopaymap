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
  if (missing.length > 0) {
    throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
  }
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
  'p6_08_production_admin_owner_secret_base64url',
  'p6_08_production_admin_owner_subject',
  'admin_access:not_enforced',
  'admin_login:not_available',
  '/admin/',
  '/admin/login',
  'loginavailable',
  'pages_project:missing_or_inaccessible',
  'production_dns:missing',
  'intended_release:not_observed',
  'productionmutation: false',
  "method = 'get'",
]);

for (const forbidden of [
  'p6_08_production_cf_access_team_domain',
  'p6_08_production_cf_access_aud',
]) {
  if (files.runner.includes(forbidden)) {
    throw new Error(`production readiness runner still depends on Cloudflare Access: ${forbidden}`);
  }
}

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'diagnose_configured_production_readiness',
  'production_environment_probe:',
  'inspect github production environment read-only before any environment binding',
  'diagnose_blocked_environment:',
  'environment: production',
  'verify exact current main',
  "node --input-type=module <<'node'",
  "method: 'get'",
  'production_environment_status',
  'production_environment_protection_count',
  'production-readiness-diagnostic.json',
  'config/production-authorization/readiness-diagnostic.json',
  "if(r.decision!=='ready')",
  'actions: read',
  'contents: write',
]);

const probeStart = files.workflow.indexOf('\n  production_environment_probe:');
const blockedStart = files.workflow.indexOf('\n  diagnose_blocked_environment:');
const protectedStart = files.workflow.indexOf('\n  diagnose:\n');
if (!(probeStart >= 0 && blockedStart > probeStart && protectedStart > blockedStart)) {
  throw new Error(
    'workflow job ordering does not preserve probe -> blocked/protected diagnostic boundary',
  );
}
const probeSection = files.workflow.slice(probeStart, blockedStart);
const blockedSection = files.workflow.slice(blockedStart, protectedStart);
const protectedSection = files.workflow.slice(protectedStart);
if (probeSection.includes('environment: production')) {
  throw new Error('production environment probe must not bind environment: production');
}
if (blockedSection.includes('environment: production')) {
  throw new Error('blocked-environment diagnostic must not bind environment: production');
}
if (!protectedSection.includes('environment: production')) {
  throw new Error('protected diagnostic must bind environment: production');
}
for (const secretName of [
  'p6_08_production_database_url',
  'p6_08_production_review_secret_seed_base64url',
  'p6_08_production_turnstile_secret_key',
  'p6_08_production_turnstile_site_key',
  'p6_08_production_admin_owner_secret_base64url',
  'p6_08_production_admin_owner_subject',
  'p6_08_production_credential_generation_id',
]) {
  if (blockedSection.includes(`secrets.${secretName}`)) {
    throw new Error(`blocked-environment diagnostic must not read protected secret ${secretName}`);
  }
  if (!protectedSection.includes(`secrets.${secretName}`)) {
    throw new Error(`protected diagnostic missing Environment secret ${secretName}`);
  }
}
for (const forbidden of [
  'secrets.p6_08_production_cf_access_team_domain',
  'secrets.p6_08_production_cf_access_aud',
]) {
  if (protectedSection.includes(forbidden)) {
    throw new Error(`protected diagnostic still reads Cloudflare Access secret ${forbidden}`);
  }
}

expectIncludes('documentation', files.doc, [
  'read-only',
  '`cryptopaymap-production`',
  '`cryptopaymap-staging`',
  'github `production` environment',
  'protection rule',
  'unbound probe job',
  'does not bind `environment: production`',
  'protected diagnostic job',
  'binds `environment: production`',
  'environment secrets',
  'p6-05 candidate release',
  'production-specific runtime inputs',
  'owner-session',
  'turnstile',
  'unauthenticated',
  '`/admin/`',
  '`/admin/login`',
  '403',
  '200',
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
