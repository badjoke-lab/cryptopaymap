import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const relativePath = 'admin/candidates/existing-target/index.html';
const absolutePath = join('dist', relativePath);
if (!existsSync(absolutePath)) {
  throw new Error(`Missing existing-target artifact: ${relativePath}`);
}

const content = readFileSync(absolutePath, 'utf8');
const requiredFragments = [
  'Existing-target boundary',
  'Reuse canonical identity without rewriting it',
  'Search and comparison workspace',
  'Exact target snapshot',
];
const forbiddenFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'CPM_ADMIN_CANDIDATE_PROMOTE_SUBJECTS',
  'DATABASE_URL',
  'requestFingerprint',
  'actorId',
];

for (const fragment of requiredFragments) {
  if (!content.includes(fragment)) {
    throw new Error(`Missing existing-target marker: ${fragment}`);
  }
}
for (const fragment of forbiddenFragments) {
  if (content.includes(fragment)) {
    throw new Error(`Private or server-only marker found in existing-target HTML: ${fragment}`);
  }
}

console.log('Candidate existing-target artifact checks passed.');
