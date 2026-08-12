import { readFileSync } from 'node:fs';

const files = {
  runner: readFileSync('scripts/run-ops-p6-017-post-cutover-launch-close.mjs', 'utf8').toLowerCase(),
  workflow: readFileSync('.github/workflows/ops-p6-017-post-cutover-launch-close.yml', 'utf8').toLowerCase(),
  doc: readFileSync('docs/OPS_P6_017_POST_CUTOVER_LAUNCH_CLOSE.md', 'utf8').toLowerCase(),
};

function expectIncludes(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) throw new Error(`${label} missing markers:\n- ${missing.join('\n- ')}`);
}

expectIncludes('runner', files.runner, [
  'observe_and_close_configured_production_launch',
  "evidenceid = 'p6-08-close'",
  'production-authorization/go-live-receipt.json',
  'p6-07-monitoring-alert-receipt.json',
  'p6-07-backup-integrity-receipt.json',
  'p6-07-isolated-restore-receipt.json',
  'p6-07-operations-recovery-receipt.json',
  'p6-04-r2-media-lifecycle-receipt.json',
  "method: 'get'",
  'tlsv1.2',
  'tlsv1.3',
  'apex_redirect_contract_failed',
  'split_target_legacy_cname_visible',
  '/llms.txt',
  '/ai.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/admin/',
  'canonical_data_too_stale',
  'data_digest_mismatch',
  'observation_identity:mixed',
  'open_risk_register:invalid_or_blocking',
  'incident_links:open_or_invalid',
  "state: decision.state",
  'productionmutation: false',
  'launchclosemutation: false',
]);

expectIncludes('workflow', files.workflow, [
  'workflow_dispatch',
  'observe_and_close_configured_production_launch',
  'observation_minutes',
  'sample_interval_minutes',
  'open_risk_register_json',
  'deferred_items_json',
  'incident_issue_numbers',
  'next_operational_review_date',
  'environment: production',
  'verify exact current main',
  'observe incident issues read-only',
  'production-launch-close-attempt-receipt.json',
  'config/production-authorization/launch-close-receipt.json',
  'immutable_launch_close_conflict',
  "if(r.state!=='closed')",
]);

expectIncludes('documentation', files.doc, [
  'observation window',
  'read-only',
  'cannot close immediately',
  'release identity',
  'dns',
  'tls',
  'canonical host',
  '`llms.txt`',
  '`ai.txt`',
  '`robots.txt`',
  '`sitemap.xml`',
  'unauthenticated admin',
  'monitoring',
  'alert',
  'backup',
  'restore',
  'open-risk register',
  'deferred items',
  'incident links',
  'next operational review',
  'immutable historical evidence',
]);

console.log('OPS-P6-017 post-cutover launch-close contract passed.');
