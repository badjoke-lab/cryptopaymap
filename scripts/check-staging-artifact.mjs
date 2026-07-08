import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const outputDirectory = 'dist';
const requiredFiles = [
  'index.html',
  '_headers',
  'admin/index.html',
  'admin/candidates/index.html',
  'admin/candidates/detail/index.html',
  'admin/candidates/duplicates/index.html',
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
  'Candidate promotion and existing-target linking use separate write capabilities and exact state guards.',
  'Correction, Evidence, reconfirmation, Media, release, publication, restore, and Audit remain separate protected boundaries.',
  'Private records are not embedded in static HTML.',
  'Audit history',
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
  'Candidate-to-canonical promotion is disabled.',
  'Public export publication is disabled.',
  'Release controls remain unavailable until the dedicated publication item.',
];

for (const fragment of requiredAdminFragments) {
  if (!adminOverview.includes(fragment)) {
    throw new Error(`Missing administration shell marker: ${fragment}`);
  }
}
for (const fragment of forbiddenAdminFragments) {
  if (adminOverview.includes(fragment)) {
    throw new Error(`Private, server-only, or stale marker found in admin HTML: ${fragment}`);
  }
}

const claimsPage = readFileSync(join(outputDirectory, 'admin/claims/index.html'), 'utf8');
const requiredClaimsFragments = [
  'Claim operation boundary',
  'No single editor bypasses review or publication boundaries',
  'Candidate review and promotion',
  'Evidence review and Claim decisions',
  'Reconfirmation and stale transitions',
  'Claim-related Audit history',
];
for (const fragment of requiredClaimsFragments) {
  if (!claimsPage.includes(fragment)) {
    throw new Error(`Missing Claim workflow marker: ${fragment}`);
  }
}
if (claimsPage.includes('Canonical payment-claim editing will be added')) {
  throw new Error('Stale Claim placeholder copy found in Claim workflow HTML.');
}

const submissionsPage = readFileSync(join(outputDirectory, 'admin/submissions/index.html'), 'utf8');
const requiredSubmissionFragments = [
  'Future protected boundary',
  'No submission records or controls are connected',
  'Public submissions do not exist yet',
];
for (const fragment of requiredSubmissionFragments) {
  if (!submissionsPage.includes(fragment)) {
    throw new Error(`Missing future Submission boundary marker: ${fragment}`);
  }
}

const candidateQueuePage = readFileSync(
  join(outputDirectory, 'admin/candidates/index.html'),
  'utf8',
);
const requiredCandidateFragments = [
  'Candidate read boundary',
  'Queue access is separate from dashboard and write capabilities',
  'Read-only summaries',
];
const forbiddenCandidateFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'rawPayload',
  'sourceUrl',
  'internalNote',
  'canonicalEntityId',
  'canonicalLocationId',
  'storageKey',
];
for (const fragment of requiredCandidateFragments) {
  if (!candidateQueuePage.includes(fragment)) {
    throw new Error(`Missing Candidate queue marker: ${fragment}`);
  }
}
for (const fragment of forbiddenCandidateFragments) {
  if (candidateQueuePage.includes(fragment)) {
    throw new Error(`Private or server-only marker found in Candidate HTML: ${fragment}`);
  }
}

const candidateDetailPage = readFileSync(
  join(outputDirectory, 'admin/candidates/detail/index.html'),
  'utf8',
);
const requiredCandidateDetailFragments = [
  'Candidate inspection boundary',
  'Known source payloads are revalidated before an allowlisted snapshot is shown',
  'Protected inspection',
  'Duplicate review, new-target promotion, and existing-target linking remain separate guarded operations',
];
const forbiddenCandidateDetailFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'DATABASE_URL',
  'rawPayload',
  'normalizedRecord',
  'privateExtra',
  'sourceRecordId',
  'actorId',
  'promotion and publication remain unavailable',
];
for (const fragment of requiredCandidateDetailFragments) {
  if (!candidateDetailPage.includes(fragment)) {
    throw new Error(`Missing Candidate detail marker: ${fragment}`);
  }
}
for (const fragment of forbiddenCandidateDetailFragments) {
  if (candidateDetailPage.includes(fragment)) {
    throw new Error(
      `Private, server-only, or stale marker found in Candidate detail HTML: ${fragment}`,
    );
  }
}

const duplicateReviewPage = readFileSync(
  join(outputDirectory, 'admin/candidates/duplicates/index.html'),
  'utf8',
);
const requiredDuplicateReviewFragments = [
  'Identity review boundary',
  'Persisted signals support review but never make the decision',
  'Explicit decision only',
];
const forbiddenDuplicateReviewFragments = [
  'CPM_ADMIN_CANDIDATE_SUBJECTS',
  'CPM_ADMIN_CANDIDATE_RESOLVE_SUBJECTS',
  'DATABASE_URL',
  'rawPayload',
  'resolutionNote',
  'actorId',
];
for (const fragment of requiredDuplicateReviewFragments) {
  if (!duplicateReviewPage.includes(fragment)) {
    throw new Error(`Missing duplicate review marker: ${fragment}`);
  }
}
for (const fragment of forbiddenDuplicateReviewFragments) {
  if (duplicateReviewPage.includes(fragment)) {
    throw new Error(`Private or server-only marker found in duplicate review HTML: ${fragment}`);
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
