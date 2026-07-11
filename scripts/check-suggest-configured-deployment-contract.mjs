import { readFileSync } from 'node:fs';
import { deriveSuggestReviewSecrets } from './derive-suggest-review-secrets.mjs';

const pagesConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const workflow = readFileSync('.github/workflows/staging-review-deploy.yml', 'utf8');
const workerConfig = readFileSync('workers/submission-rate-limit/wrangler.jsonc', 'utf8');
const suggestPage = readFileSync('src/pages/suggest.astro', 'utf8');
const configuredForm = readFileSync('src/components/submissions/ConfiguredSuggestForm.tsx', 'utf8');
const reviewSecretDerivation = readFileSync('scripts/derive-suggest-review-secrets.mjs', 'utf8');

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  'CPM_REVIEW_SECRET_SEED_BASE64URL',
  'node scripts/derive-suggest-review-secrets.mjs review-derived-secrets.json',
  'wrangler pages secret bulk pages-secrets.json',
  '--env preview',
  '1x00000000000000000000AA',
  '1x0000000000000000000000000000000AA',
  "CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_ID: 'review-v1'",
  "CPM_SUBMISSION_CONTACT_RETENTION_DAYS: '180'",
  "CPM_SUBMISSION_RATE_LIMIT_MAX_REQUESTS: '5'",
  "CPM_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS: '600'",
  "CPM_TURNSTILE_EXPECTED_HOSTNAME: 'review.cryptopaymap-staging.pages.dev'",
  "CPM_TURNSTILE_EXPECTED_ACTION: 'submission_intake'",
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

for (const marker of [
  "hkdfSync('sha256'",
  'cryptopaymap:review-suggest:v1',
  'submission-status-hmac-key',
  'submission-contact-encryption-key',
  'submission-email-hash-hmac-key',
  'submission-rate-limit-bucket-hmac-key',
  'suggest-readiness-token',
]) {
  if (!reviewSecretDerivation.includes(marker)) {
    throw new Error(`Review secret derivation marker missing: ${marker}`);
  }
}

for (const obsoleteSecret of [
  'secrets.CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL',
  'secrets.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL',
  'secrets.CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL',
  'secrets.CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL',
  'secrets.CPM_TURNSTILE_SECRET_KEY',
  'secrets.PUBLIC_TURNSTILE_SITE_KEY',
  'secrets.CPM_SUGGEST_READINESS_TOKEN',
]) {
  if (workflow.includes(obsoleteSecret)) {
    throw new Error(`Obsolete per-value review secret remains in workflow: ${obsoleteSecret}`);
  }
}

const seedOne = Buffer.alloc(32, 7).toString('base64url');
const seedTwo = Buffer.alloc(32, 8).toString('base64url');
const first = deriveSuggestReviewSecrets(seedOne);
const replay = deriveSuggestReviewSecrets(seedOne);
const changed = deriveSuggestReviewSecrets(seedTwo);

assert(JSON.stringify(first) === JSON.stringify(replay), 'Review secret derivation is not deterministic.');
assert(
  JSON.stringify(first) !== JSON.stringify(changed),
  'Review secret derivation did not change for a different seed.',
);

const derivedKeys = [
  first.CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL,
  first.CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL,
  first.CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL,
  first.CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL,
];
assert(new Set(derivedKeys).size === 4, 'Review cryptographic keys are not purpose-separated.');
for (const value of derivedKeys) {
  assert(/^[A-Za-z0-9_-]{43}$/.test(value), 'Derived review key is not canonical Base64URL.');
  assert(Buffer.from(value, 'base64url').length === 32, 'Derived review key is not 32 bytes.');
  assert(
    Buffer.from(value, 'base64url').toString('base64url') === value,
    'Derived review key is not canonical.',
  );
}
assert(
  /^cpmrv_[A-Za-z0-9_-]{43}$/.test(first.CPM_SUGGEST_READINESS_TOKEN),
  'Derived readiness token is invalid.',
);

for (const invalidSeed of [
  `${seedOne}=`,
  Buffer.alloc(16, 7).toString('base64url'),
  'not base64url',
]) {
  let rejected = false;
  try {
    deriveSuggestReviewSecrets(invalidSeed);
  } catch {
    rejected = true;
  }
  assert(rejected, 'Invalid review seed was accepted.');
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
