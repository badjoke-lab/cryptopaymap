import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pagePath = 'admin/audit/index.html';
const absolutePath = join('dist', pagePath);

if (!existsSync(absolutePath)) {
  throw new Error(`Missing Audit history artifact: ${pagePath}`);
}

const content = readFileSync(absolutePath, 'utf8');
for (const fragment of [
  'Audit history',
  'Protected read boundary',
  'History without private payload leakage',
  'Cross-domain audit workspace',
  'Read only · metadata only',
]) {
  if (!content.includes(fragment)) {
    throw new Error(`Missing Audit history marker in ${pagePath}: ${fragment}`);
  }
}

for (const forbidden of [
  'CPM_ADMIN_AUDIT_READ_ACTOR_IDS',
  'DATABASE_URL',
  'requestFingerprint',
  'internalNote',
  'privateStorageKey',
]) {
  if (content.includes(forbidden)) {
    throw new Error(`Private Audit history marker found in ${pagePath}: ${forbidden}`);
  }
}

console.log('Audit history artifact checks passed.');
