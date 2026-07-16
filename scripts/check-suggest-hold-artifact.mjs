import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const detailPage = readFileSync(join('dist', 'admin/submissions/detail/index.html'), 'utf8');

const requiredFragments = [
  'P5-06C common boundary',
  'Information, Hold, and resume',
  'time-bounded Hold',
  'resume review explicitly',
];

for (const fragment of requiredFragments) {
  if (!detailPage.includes(fragment)) {
    throw new Error(`Missing common Suggest Hold staging marker: ${fragment}`);
  }
}

const forbiddenFragments = [
  'CPM_ADMIN_SUBMISSION_REVIEW_FOLLOWUP_SUBJECTS',
  'DATABASE_URL',
  'internalNote',
  'statusTokenHash',
  'requestFingerprint',
  'encryptedEmail',
  'emailHash',
];

for (const fragment of forbiddenFragments) {
  if (detailPage.includes(fragment)) {
    throw new Error(`Private or server-only Hold marker found in HTML: ${fragment}`);
  }
}

console.log('Common Suggest Hold staging artifact checks passed.');
