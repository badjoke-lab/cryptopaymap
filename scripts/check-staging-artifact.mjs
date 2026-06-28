import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const outputDirectory = 'dist';
const requiredFiles = [
  'index.html',
  '_headers',
  'admin/index.html',
  'admin/candidates/index.html',
  'admin/claims/index.html',
  'admin/evidence/index.html',
  'admin/rechecks/index.html',
  'admin/submissions/index.html',
  'admin/media/index.html',
  'admin/exports/index.html',
  'admin/audit/index.html',
  'data/foundation-place.json',
  'manifest.webmanifest',
  'icons/cryptopaymap.svg',
  'icons/cryptopaymap-maskable.svg',
];

for (const relativePath of requiredFiles) {
  const absolutePath = join(outputDirectory, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing staging artifact file: ${relativePath}`);
  }
}

const headers = readFileSync(join(outputDirectory, '_headers'), 'utf8');
const requiredHeaderFragments = [
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Cache-Control: private, no-store',
  'X-Robots-Tag: noindex, nofollow, noarchive',
  'Cache-Control: public, max-age=31556952, immutable',
  'Cache-Control: public, max-age=300, must-revalidate',
];

for (const fragment of requiredHeaderFragments) {
  if (!headers.includes(fragment)) {
    throw new Error(`Missing required staging header: ${fragment}`);
  }
}

const adminOverview = readFileSync(join(outputDirectory, 'admin/index.html'), 'utf8');
const requiredAdminFragments = [
  'noindex, nofollow, noarchive',
  'Protected workspace',
  'Read-only bounded counts',
  'Dashboard access grants no write capability.',
  'Private records are not embedded in static HTML.',
];
const forbiddenAdminFragments = [
  'CF_ACCESS_TEAM_DOMAIN',
  'CF_ACCESS_AUD',
  'CPM_ADMIN_DASHBOARD_SUBJECTS',
  'Cf-Access-Jwt-Assertion',
  'rawPayload',
  'candidateId',
  'sourceRecordId',
  'storageKey',
];

for (const fragment of requiredAdminFragments) {
  if (!adminOverview.includes(fragment)) {
    throw new Error(`Missing administration shell marker: ${fragment}`);
  }
}
for (const fragment of forbiddenAdminFragments) {
  if (adminOverview.includes(fragment)) {
    throw new Error(`Private or server-only marker found in admin HTML: ${fragment}`);
  }
}

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.webmanifest',
  '',
]);
const forbiddenMarkers = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'DATABASE_URL='];

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      scanDirectory(absolutePath);
      continue;
    }

    if (!textExtensions.has(extname(entry))) continue;

    const content = readFileSync(absolutePath, 'utf8');
    for (const marker of forbiddenMarkers) {
      if (content.includes(marker)) {
        throw new Error(`Server-only marker found in staging artifact: ${marker}`);
      }
    }
  }
}

scanDirectory(outputDirectory);
console.log('Staging artifact checks passed.');
