import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const suggestPage = readFileSync(join('dist', 'suggest/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');

const requiredSuggestFragments = [
  'Suggest a place or online service',
  'Suggestions remain private until reviewed',
  'Submit suggestion',
  'A submission creates private review material only',
];

for (const fragment of requiredSuggestFragments) {
  if (!suggestPage.includes(fragment)) {
    throw new Error(`Missing Suggest form staging marker: ${fragment}`);
  }
}

const requiredContributeFragments = [
  'Help improve verified payment information',
  'Open Suggest form',
  'Payment and problem reports',
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
  '/suggest',
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

for (const fragment of requiredCspFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing Suggest Turnstile CSP marker: ${fragment}`);
  }
}

console.log('Suggest form and Turnstile CSP artifact checks passed.');
