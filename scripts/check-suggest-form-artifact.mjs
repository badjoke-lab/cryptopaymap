import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const suggestPage = readFileSync(join('dist', 'suggest/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');
const runtimeHeaderPolicy = readFileSync('src/http/pages-response-headers.ts', 'utf8');
const pagesMiddleware = readFileSync('functions/_middleware.ts', 'utf8');

const requiredSuggestFragments = [
  'Suggest a place or online service',
  'Suggestions remain private until reviewed',
  'Preparing the secure submission form',
  'Loading the review and verification configuration for this environment.',
];

for (const fragment of requiredSuggestFragments) {
  if (!suggestPage.includes(fragment)) {
    throw new Error(`Missing Suggest form staging marker: ${fragment}`);
  }
}

const requiredContributeFragments = [
  'Help improve verified payment information',
  'Open Suggest form',
  'Open Payment report',
  'Open Problem report',
  'Claims and photos',
];

for (const fragment of requiredContributeFragments) {
  if (!contributePage.includes(fragment)) {
    throw new Error(`Missing contribution entry staging marker: ${fragment}`);
  }
}

const forbiddenSuggestFragments = [
  'CPM_TURNSTILE_SECRET_KEY',
  'CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL',
  'CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL',
  'CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL',
  'CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL',
  'CPM_SUGGEST_READINESS_TOKEN',
  'DATABASE_URL',
  'SUBMISSION_RATE_LIMIT_BUCKETS',
  'encryptedEmail',
  'emailHash',
  'statusTokenHash',
  'requestFingerprint',
];

for (const fragment of forbiddenSuggestFragments) {
  if (suggestPage.includes(fragment)) {
    throw new Error(`Private or server-only Suggest marker found in HTML: ${fragment}`);
  }
}

const requiredCspFragments = [
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

if (!headers.includes('/suggest')) {
  throw new Error('Missing static Suggest header path marker.');
}
for (const fragment of requiredCspFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing static Suggest Turnstile CSP marker: ${fragment}`);
  }
  if (!runtimeHeaderPolicy.includes(fragment)) {
    throw new Error(`Missing Pages Function Suggest CSP marker: ${fragment}`);
  }
}

for (const marker of ['applyPagesResponseHeaders', 'context.next()']) {
  if (!pagesMiddleware.includes(marker)) {
    throw new Error(`Missing Pages response-header middleware marker: ${marker}`);
  }
}

console.log('Suggest form and static/Function Turnstile CSP checks passed.');
