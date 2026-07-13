import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const paymentReportPage = readFileSync(join('dist', 'payment-report/index.html'), 'utf8');
const problemReportPage = readFileSync(join('dist', 'report/index.html'), 'utf8');
const contributePage = readFileSync(join('dist', 'contribute/index.html'), 'utf8');
const headers = readFileSync(join('dist', '_headers'), 'utf8');
const runtimeHeaderPolicy = readFileSync('src/http/pages-response-headers.ts', 'utf8');

for (const [label, page, fragments] of [
  [
    'Payment report',
    paymentReportPage,
    [
      'Report a payment result',
      'The report remains private until reviewed.',
      'Preparing the secure report form',
      'Loading the review and verification configuration for this environment.',
    ],
  ],
  [
    'Problem report',
    problemReportPage,
    [
      'Report a problem',
      'A report never changes public data automatically.',
      'Preparing the secure report form',
      'Loading the review and verification configuration for this environment.',
    ],
  ],
]) {
  for (const fragment of fragments) {
    if (!page.includes(fragment)) {
      throw new Error(`Missing ${label} staging marker: ${fragment}`);
    }
  }
}

for (const fragment of [
  'I paid here',
  'Open Payment report',
  'Report a problem',
  'Open Problem report',
  'Available now',
]) {
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
  for (const [label, page] of [
    ['Payment report', paymentReportPage],
    ['Problem report', problemReportPage],
  ]) {
    if (page.includes(fragment)) {
      throw new Error(`Private or server-only ${label} marker found in HTML: ${fragment}`);
    }
  }
}

const requiredCspFragments = [
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

for (const path of ['/payment-report', '/report']) {
  if (!headers.includes(path)) {
    throw new Error(`Missing static Report header path marker: ${path}`);
  }
  if (!runtimeHeaderPolicy.includes(`isExactPath(pathname, '${path}')`)) {
    throw new Error(`Missing Pages Function Report path header marker: ${path}`);
  }
}

for (const fragment of requiredCspFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing static Report Turnstile CSP marker: ${fragment}`);
  }
  if (!runtimeHeaderPolicy.includes(fragment)) {
    throw new Error(`Missing Pages Function Report CSP marker: ${fragment}`);
  }
}

console.log('Payment/problem form and static/Function Turnstile CSP checks passed.');
