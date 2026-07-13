import { existsSync, readFileSync } from 'node:fs';

const requiredPages = [
  {
    path: 'dist/admin/submissions/index.html',
    markers: ['Payment and problem report queue', 'Suggest review queue', 'Protected read-only'],
  },
  {
    path: 'dist/admin/submissions/report-detail/index.html',
    markers: ['Payment and problem report', 'P5-03D read-only boundary', 'Protected report detail'],
  },
];

for (const page of requiredPages) {
  if (!existsSync(page.path)) {
    throw new Error(`Missing P5-03D built page: ${page.path}`);
  }
  const html = readFileSync(page.path, 'utf8');
  for (const marker of page.markers) {
    if (!html.includes(marker)) {
      throw new Error(`Missing P5-03D marker ${JSON.stringify(marker)} in ${page.path}`);
    }
  }
  for (const forbidden of ['statusTokenHash', 'encryptedEmail', 'requestFingerprint']) {
    if (html.includes(forbidden)) {
      throw new Error(`Protected operational marker leaked into ${page.path}: ${forbidden}`);
    }
  }
}

console.log('P5-03D report reviewer artifacts are present and bounded.');
