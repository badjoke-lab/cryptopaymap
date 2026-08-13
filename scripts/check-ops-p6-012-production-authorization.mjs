import { readFileSync } from 'node:fs';

const files = {
  evaluator: readFileSync(
    'scripts/evaluate-ops-p6-012-production-authorization.mjs',
    'utf8',
  ).toLowerCase(),
  workflow: readFileSync(
    '.github/workflows/ops-p6-012-configured-production-authorization.yml',
    'utf8',
  ).toLowerCase(),
  doc: readFileSync('docs/OPS_P6_012_CONFIGURED_PRODUCTION_AUTHORIZATION.md', 'utf8').toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('evaluator', files.evaluator, [
  'authorize_configured_production',
  "environment: 'configured_production'",
  "state: authorized ? 'authorized' : 'not_authorized'",
  'configured_staging_authorization:not_current',
  'production_candidate:not_current',
  'production_readiness:not_ready',
  'production_candidate:release_authority_mismatch',
  'production_readiness:release_authority_mismatch',
  'candidateartifactid',
  'productionevidencebinding',
  'explicit_dispatch:required',
  'operator_roles:not_distinct',
  'authorization_ttl:exceeds_predecessor_expiry',
  'productionmutation: false',
  'predecessorbinding',
  'p6-07',
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'authorize_configured_production',
  'verify exact current main',
  'repository_contract_outcome',
  'production-authorization-attempt-receipt.json',
  'config/production-authorization/authorization-receipt.json',
  "if(r.state!=='authorized')",
  'contents: write',
]);

expectIncludes('documentation', files.doc, [
  'production authorization does not execute production',
  'exact current `main`',
  'configured-staging authorization',
  'production candidate bootstrap',
  'production readiness',
  'candidate artifact',
  'p6-05 release authority',
  'p6-01 through p6-07',
  '`authorize_configured_production`',
  'independent observer',
  'authorization expires',
  'production mutation: none',
  'separate go-live execution',
]);

expectIncludes('evaluator', files.evaluator, [
  'credentialgenerationdigest',
  'production_credential_generation:mismatch',
]);

console.log('OPS-P6-012 configured production authorization contract passed.');
