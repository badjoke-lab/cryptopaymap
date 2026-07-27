import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_04_CONFIGURED_R2_MEDIA_LIFECYCLE_EVIDENCE.md',
  'docs/P6_03_LIVE_NEON_TRANSACTION_RECEIPT_EVIDENCE.md',
  'docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md',
  'docs/PROJECT_STATUS.md',
  'docs/SECURITY_AND_PRIVACY.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const normalize = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();

const evidence = normalize(
  'docs/P6_04_CONFIGURED_R2_MEDIA_LIFECYCLE_EVIDENCE.md',
);
const p507f = normalize('docs/P5_07F_PHOTO_MEDIA_RECEIPT_BINDING.md');
const security = normalize('docs/SECURITY_AND_PRIVACY.md');
const status = normalize('docs/PROJECT_STATUS.md');

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
  }
};

assertMarkers('P6-04 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'private quarantine upload',
  'browser-supplied mime type is not trusted',
  'private original remains private',
  'only approved derivatives may be public',
  'failure after derivative write but before receipt commit',
  'no orphaned public object',
  'cdn purge or cache-version invalidation',
  'externally observable checks confirm unavailability',
  'deletion of a database row alone is not sufficient proof',
  'no r2 credential, signed upload secret, raw private original',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-05 owns configured public export generation',
]);

assertMarkers('P5-07F preservation', p507f, [
  'photos',
  'media',
  'receipt',
  'private',
]);

assertMarkers('Security architecture', security, [
  'object storage',
  'private originals',
  'public objects',
  'signed url',
  'media',
]);

assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-04 — configured r2 media lifecycle evidence',
  'p6-03 — live neon canonical transaction and application receipt evidence completed in #281 for issue #280',
  '9d7ffcd7acd891c91b474e4a3af503c0c64d8cb5',
  'p6-05 configured public export and release evidence',
]);

console.log('P6-04 configured R2 media lifecycle evidence contract passed.');
