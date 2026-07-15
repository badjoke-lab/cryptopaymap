import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const photosPage = readFileSync(join('dist', 'photos/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');
const runtimeHeaderPolicy = readFileSync('src/http/pages-response-headers.ts', 'utf8');

for (const fragment of [
  'Add photos for private review',
  'Files go directly to private quarantine',
  'Preparing the secure photo form',
  'Loading the private upload and verification configuration for this environment.',
]) {
  if (!photosPage.includes(fragment)) {
    throw new Error(`Missing Photos staging marker: ${fragment}`);
  }
}

for (const fragment of ['Add photos', 'Open Photos form', 'Available now']) {
  if (!contributePage.includes(fragment)) {
    throw new Error(`Missing Photos contribution marker: ${fragment}`);
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
  'QUARANTINE_UPLOAD_AUTHORIZER',
  'encryptedEmail',
  'emailHash',
  'statusTokenHash',
  'requestFingerprint',
  'uploadUrl',
  'requiredHeaders',
]) {
  if (photosPage.includes(fragment)) {
    throw new Error(`Private or server-only Photos marker found in HTML: ${fragment}`);
  }
}

const requiredStaticCspFragments = [
  '/photos',
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self' https:",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

for (const fragment of requiredStaticCspFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing static Photos CSP marker: ${fragment}`);
  }
}

for (const fragment of [
  "isExactPath(pathname, '/photos')",
  'photoContentSecurityPolicy',
  "connect-src 'self' https:",
]) {
  if (!runtimeHeaderPolicy.includes(fragment)) {
    throw new Error(`Missing Pages Function Photos CSP marker: ${fragment}`);
  }
}

console.log('Photos form, contribution entry, leakage, and CSP checks passed.');
