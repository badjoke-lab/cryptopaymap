import { hkdfSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const seedEnvironmentName = 'CPM_REVIEW_SECRET_SEED_BASE64URL';
const derivationSalt = Buffer.from('cryptopaymap:review-suggest:v1', 'utf8');

function decodeCanonicalBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${seedEnvironmentName} must use canonical unpadded Base64URL.`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== value) {
    throw new Error(`${seedEnvironmentName} must encode exactly 32 random bytes.`);
  }
  return decoded;
}

function derive(seed, label, length = 32) {
  return Buffer.from(
    hkdfSync('sha256', seed, derivationSalt, Buffer.from(label, 'utf8'), length),
  );
}

export function deriveSuggestReviewSecrets(seedBase64Url) {
  const seed = decodeCanonicalBase64Url(seedBase64Url);
  return Object.freeze({
    CPM_SUBMISSION_STATUS_HMAC_KEY_BASE64URL: derive(
      seed,
      'submission-status-hmac-key',
    ).toString('base64url'),
    CPM_SUBMISSION_CONTACT_ENCRYPTION_KEY_BASE64URL: derive(
      seed,
      'submission-contact-encryption-key',
    ).toString('base64url'),
    CPM_SUBMISSION_EMAIL_HASH_HMAC_KEY_BASE64URL: derive(
      seed,
      'submission-email-hash-hmac-key',
    ).toString('base64url'),
    CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: derive(
      seed,
      'submission-rate-limit-bucket-hmac-key',
    ).toString('base64url'),
    CPM_SUGGEST_READINESS_TOKEN: `cpmrv_${derive(seed, 'suggest-readiness-token').toString('base64url')}`,
  });
}

function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Output path is required.');
  }
  const seed = process.env[seedEnvironmentName];
  if (!seed) {
    throw new Error(`${seedEnvironmentName} is required.`);
  }
  const derived = deriveSuggestReviewSecrets(seed);
  writeFileSync(outputPath, `${JSON.stringify(derived)}\n`, { mode: 0o600 });
  console.log('Stable Suggest review secrets derived.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
