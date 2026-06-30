import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const relativePath = 'admin/candidates/promotion/index.html';
const absolutePath = join('dist', relativePath);
if (!existsSync(absolutePath)) {
  throw new Error(`Missing Candidate promotion artifact: ${relativePath}`);
}

const content = readFileSync(absolutePath, 'utf8');
const requiredFragments = [
  'Canonical promotion boundary',
  'Every normalized value is explicit and every new record remains hidden',
  'Hidden canonical editor',
  'Explicit commit only',
];
const forbiddenFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS',
  'DATABASE_URL',
  'rawPayload',
  'requestFingerprint',
  'actorId',
];

for (const fragment of requiredFragments) {
  if (!content.includes(fragment)) {
    throw new Error(`Missing Candidate promotion marker: ${fragment}`);
  }
}
for (const fragment of forbiddenFragments) {
  if (content.includes(fragment)) {
    throw new Error(`Private or server-only marker found in Candidate promotion HTML: ${fragment}`);
  }
}

console.log('Candidate promotion artifact checks passed.');
