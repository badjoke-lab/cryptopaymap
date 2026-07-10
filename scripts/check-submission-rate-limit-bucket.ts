import { createSubmissionRateLimitBucketDeriverFromEnvironment } from '../src/submissions/rate-limit-bucket-environment';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const deriver = createSubmissionRateLimitBucketDeriverFromEnvironment({
  CPM_SUBMISSION_RATE_LIMIT_BUCKET_HMAC_KEY_BASE64URL: encodeBase64Url(new Uint8Array(32).fill(17)),
});

const rawIdentity = '203.0.113.42';
const first = await deriver.deriveBucketKey(rawIdentity);
const second = await deriver.deriveBucketKey(rawIdentity);

if (first !== second || !/^rl_[A-Za-z0-9_-]{16,128}$/.test(first)) {
  throw new Error('Submission rate-limit bucket derivation contract failed.');
}
if (first.includes(rawIdentity)) {
  throw new Error('Submission rate-limit bucket key exposed raw edge identity.');
}

console.log('Submission rate-limit bucket derivation checks passed.');
