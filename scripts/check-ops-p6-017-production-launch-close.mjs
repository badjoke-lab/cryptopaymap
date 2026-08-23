import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync('scripts/run-ops-p6-017-production-launch-close.mjs', 'utf8').toLowerCase(),
  workflow: readFileSync(
    '.github/workflows/ops-p6-017-configured-production-launch-close.yml',
    'utf8',
  ).toLowerCase(),
  doc: readFileSync('docs/OPS_P6_017_CONFIGURED_PRODUCTION_LAUNCH_CLOSE.md', 'utf8').toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('runner', files.runner, [
  'observe_and_close_configured_production',
  'no_launch_blocking_incident',
  "evidenceid = 'p6-08-launch-close'",
  'go_live:not_accepted_or_incomplete',
  'p6-07-q2',
  'p6-07-q3',
  'p6-07-q4',
  'p6-07-q5',
  'not_current_through_observation',
  'observationminutes, 15, 60',
  'sampleintervalminutes, 5, 15',
  'observation_samples:incomplete_or_failed',
  'observation_window:not_elapsed',
  'credential_generation:changed_or_invalid',
  'close_operators:not_authorized',
  '/version.json',
  '/data/manifest.json',
  '/robots.txt',
  '/llms.txt',
  '/ai.txt',
  '/sitemap.xml',
  '/admin/',
  '/icons/cryptopaymap.svg',
  'www_redirect_mismatch',
  'wwwredirect?.status !== 308',
  'apexaddresscount',
  'redirectaddresscount',
  'redirect_dns_returned_to_legacy',
  'tls_certificate_invalid',
  'release_marker_mismatch',
  'public_data_identity_mismatch',
  'robots_contract_mismatch',
  'llms_contract_mismatch',
  'ai_contract_mismatch',
  'sitemap_contract_mismatch',
  'risk_register',
  'deferred_items',
  'next_review_at',
  'productionmutation: false',
  "launchclosed: state === 'closed'",
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'observe_and_close_configured_production',
  'no_launch_blocking_incident',
  'environment: production',
  'p6_08_production_credential_generation_id',
  'verify exact current main',
  'repository_contract_outcome',
  'production-launch-close-attempt-receipt.json',
  'config/production-authorization/last-launch-close-attempt-receipt.json',
  'config/production-authorization/launch-close-receipt.json',
  "if(r.state!=='closed')",
  'contents: write',
]);

expectIncludes('documentation', files.doc, [
  'read-only',
  'accepted p6-08 go-live',
  '30 minutes',
  '15 to 60 minutes',
  'at least three samples',
  'p6-07-q2 through p6-07-q5',
  'credential generation',
  'open risks',
  'deferred items',
  'next operational review',
  '`llms.txt`',
  '`ai.txt`',
  '`sitemap.xml`',
  'cloudflare access',
  'phase 7',
  'does not execute cutover',
]);

console.log('OPS-P6-017 configured production launch-close contract passed.');
