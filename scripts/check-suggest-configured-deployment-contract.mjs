import { readFileSync } from 'node:fs';

const pagesConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const workflow = readFileSync('.github/workflows/staging-review-deploy.yml', 'utf8');
const workerConfig = readFileSync('workers/submission-rate-limit/wrangler.jsonc', 'utf8');
const suggestPage = readFileSync('src/pages/suggest.astro', 'utf8');
const configuredForm = readFileSync('src/components/submissions/ConfiguredSuggestForm.tsx', 'utf8');

const expectedBinding = {
  name: 'SUBMISSION_RATE_LIMIT_BUCKETS',
  class_name: 'SubmissionRateLimitBucket',
  script_name: 'cryptopaymap-submission-rate-limit',
};

function hasExactBinding(bindings) {
  return bindings.some(
    (binding) =>
      binding.name === expectedBinding.name &&
      binding.class_name === expectedBinding.class_name &&
      binding.script_name === expectedBinding.script_name,
  );
}

if (!hasExactBinding(pagesConfig.durable_objects?.bindings ?? [])) {
  throw new Error('Pages production Durable Object binding contract is missing.');
}

if (!hasExactBinding(pagesConfig.env?.preview?.durable_objects?.bindings ?? [])) {
  throw new Error('Pages preview Durable Object binding contract is missing.');
}

for (const marker of [
  'cryptopaymap-submission-rate-limit',
  'SubmissionRateLimitBucket',
  'new_sqlite_classes',
]) {
  if (!workerConfig.includes(marker)) {
    throw new Error(`Durable Object Worker configuration marker missing: ${marker}`);
  }
}

const workflowMarkers = [
  'Deploy Submission rate-limit Durable Object Worker',
  'wrangler deploy --config workers/submission-rate-limit/wrangler.jsonc',
  'wrangler pages secret bulk pages-secrets.json',
  '--env preview',
  'Deploy staging review to Cloudflare Pages',
  '--config wrangler.jsonc',
  'Verify configured Suggest review path',
  '/api/suggest/config',
  '/api/suggest/readiness',
  'Authorization: Bearer $CPM_SUGGEST_READINESS_TOKEN',
  'configuredVerification',
];

for (const marker of workflowMarkers) {
  if (!workflow.includes(marker)) {
    throw new Error(`Configured Suggest workflow marker missing: ${marker}`);
  }
}

if (!suggestPage.includes('ConfiguredSuggestForm')) {
  throw new Error('Suggest page must use runtime-configured form wrapper.');
}
if (suggestPage.includes('import.meta.env.PUBLIC_TURNSTILE_SITE_KEY')) {
  throw new Error('Suggest page must not depend on build-time Turnstile configuration.');
}
if (!configuredForm.includes("fetch('/api/suggest/config'")) {
  throw new Error('Configured Suggest form must load same-origin runtime configuration.');
}

console.log('Configured Suggest deployment contract checks passed.');
