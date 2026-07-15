import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const photoPage = readFileSync(join('dist', 'photos/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');
const runtimeHeaderPolicy = readFileSync('src/http/pages-response-headers.ts', 'utf8');

for (const fragment of [
  'Add photos for private review',
  'Files upload directly to private quarantine.',
  'A successful upload does not approve or publish any image automatically.',
  'Preparing the secure Photos form',
  'Loading the direct-upload and private review configuration for this environment.',
]) {
  if (!photoPage.includes(fragment)) {
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
  'CPM_R2_ACCOUNT_ID',
  'CPM_R2_PHOTO_QUARANTINE_BUCKET',
  'CPM_R2_ACCESS_KEY_ID',
  'CPM_R2_SECRET_ACCESS_KEY',
  'DATABASE_URL',
  'SUBMISSION_RATE_LIMIT_BUCKETS',
  'PHOTO_UPLOAD_AUTHORIZER',
  'encryptedEmail',
  'emailHash',
  'statusTokenHash',
  'requestFingerprint',
]) {
  if (photoPage.includes(fragment)) {
    throw new Error(`Private or server-only Photos marker found in HTML: ${fragment}`);
  }
}

for (const fragment of [
  '/photos',
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
]) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing static Photos CSP marker: ${fragment}`);
  }
}

for (const fragment of [
  "isExactPath(pathname, '/photos')",
  'photoContentSecurityPolicy',
  "connect-src 'self' https://*.r2.cloudflarestorage.com",
]) {
  if (!runtimeHeaderPolicy.includes(fragment)) {
    throw new Error(`Missing Pages Function Photos CSP marker: ${fragment}`);
  }
}

console.log('Photos form, contribution entry, R2 leakage, and direct-upload CSP checks passed.');
