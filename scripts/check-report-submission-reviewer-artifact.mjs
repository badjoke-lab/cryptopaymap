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
    path: 'dist/admin/submissions/report-detail/index.html',
    markers: [
      'Payment and problem report',
      'P5-06B review-entry boundary',
      'Protected report review-entry controls',
      'Protected report detail',
    ],
  },
  {
    path: 'dist/admin/submissions/photo-detail/index.html',
    markers: [
      'Photos parent Submission',
      'P5-06B Photos review-entry boundary',
      'Protected Photos parent detail and review-entry controls',
    ],
  },
];

for (const page of requiredPages) {
  if (!existsSync(page.path)) {
    throw new Error(`Missing P5-06B2 built page: ${page.path}`);
  }
  const html = readFileSync(page.path, 'utf8');
  for (const marker of page.markers) {
    if (!html.includes(marker)) {
      throw new Error(`Missing P5-06B2 marker ${JSON.stringify(marker)} in ${page.path}`);
    }
  }
  for (const forbidden of ['statusTokenHash', 'encryptedEmail', 'requestFingerprint']) {
    if (html.includes(forbidden)) {
      throw new Error(`Protected operational marker leaked into ${page.path}: ${forbidden}`);
    }
  }
}

console.log('P5-06B2 report and Photos reviewer artifacts are present and bounded.');
