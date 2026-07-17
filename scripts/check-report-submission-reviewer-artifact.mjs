import { existsSync, readFileSync } from 'node:fs';

const requiredPages = [
  {
    path: 'dist/admin/submissions/index.html',
    markers: [
      'Payment and problem report queue',
      'Photos parent review queue',
      'Suggest review queue',
      'Protected review entry',
    ],
  },
  {
    path: 'dist/admin/submissions/detail/index.html',
    markers: [
      'Suggest review',
      'Information, Hold, and resume',
      'P5-06C common boundary',
      'Accept as private Candidate',
      'P5-06D common boundary',
      'Terminal resolution',
    ],
  },
  {
    path: 'dist/admin/submissions/report-detail/index.html',
    markers: [
      'Payment and problem report',
      'P5-06B through P5-06D workflow boundary',
      'Protected report review-entry controls',
      'Protected report information Hold and resume controls',
      'Protected report terminal-resolution controls',
      'Protected report detail',
    ],
  },
  {
    path: 'dist/admin/submissions/photo-detail/index.html',
    markers: [
      'Photos parent Submission',
      'P5-06B through P5-06E Photos workflow boundary',
      'Protected Photos parent detail and review-entry controls',
      'Protected Photos information Hold and resume controls',
      'Protected Photos aggregate parent-resolution controls',
      'Protected Photos terminal-resolution controls',
    ],
  },
];

for (const page of requiredPages) {
  if (!existsSync(page.path)) {
    throw new Error(`Missing P5-06E2 built page: ${page.path}`);
  }
  const html = readFileSync(page.path, 'utf8');
  for (const marker of page.markers) {
    if (!html.includes(marker)) {
      throw new Error(`Missing P5-06E2 marker ${JSON.stringify(marker)} in ${page.path}`);
    }
  }
  for (const forbidden of [
    'statusTokenHash',
    'encryptedEmail',
    'requestFingerprint',
    'duplicateSubmissionPublicId',
    'storageKey',
    'privateProof',
  ]) {
    if (html.includes(forbidden)) {
      throw new Error(`Protected operational marker leaked into ${page.path}: ${forbidden}`);
    }
  }
}

console.log('P5-06E2 reviewer aggregate-resolution artifacts are present and bounded.');
