import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const reportPage = readFileSync(join('dist', 'report/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');
const runtimeHeaderPolicy = readFileSync('src/http/pages-response-headers.ts', 'utf8');

for (const fragment of [
  'Report a payment result or problem',
  'A report never changes public data automatically',
  'Preparing the secure report form',
  'Loading the review and verification configuration for this environment.',
]) {
  if (!reportPage.includes(fragment)) {
    throw new Error(`Missing Report form staging marker: ${fragment}`);
  }
}

for (const fragment of ['Payment and problem reports', 'Open Report form', 'Available now']) {
  if (!contributePage.includes(fragment)) {
    throw new Error(`Missing Report contribution marker: ${fragment}`);
  }
}

for (const fragment of [
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
]) {
  if (reportPage.includes(fragment)) {
    throw new Error(`Private or server-only Report marker found in HTML: ${fragment}`);
  }
}

const requiredCspFragments = [
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

if (!headers.includes('/report')) {
  throw new Error('Missing static Report header path marker.');
}
if (!runtimeHeaderPolicy.includes("isExactPath(pathname, '/report')")) {
  throw new Error('Missing Pages Function Report path header marker.');
}
for (const fragment of requiredCspFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing static Report Turnstile CSP marker: ${fragment}`);
  }
  if (!runtimeHeaderPolicy.includes(fragment)) {
    throw new Error(`Missing Pages Function Report CSP marker: ${fragment}`);
  }
}

console.log('Report form and static/Function Turnstile CSP checks passed.');
