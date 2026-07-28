import fs from 'node:fs';

const requiredFiles = [
  'docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md',
  'docs/P6_04_CONFIGURED_R2_MEDIA_LIFECYCLE_EVIDENCE.md',
  'docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md',
  'docs/PROJECT_STATUS.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const normalize = (file) =>
  fs.readFileSync(file, 'utf8').replace(/\s+/g, ' ').toLowerCase();
const evidence = normalize('docs/P6_05_CONFIGURED_PUBLIC_EXPORT_RELEASE_EVIDENCE.md');
const p508d = normalize('docs/P5_08D_CANONICAL_APPLICATION_PUBLICATION_HANDOFF_AUDIT.md');
const status = normalize('docs/PROJECT_STATUS.md');

const assertMarkers = (label, content, markers) => {
  const missing = markers.filter((marker) => !content.includes(marker.toLowerCase()));
  if (missing.length) throw new Error(`${label} markers missing:\n- ${missing.join('\n- ')}`);
};

assertMarkers('P6-05 evidence', evidence, [
  'configured staging evidence: `unproven`',
  'configured production evidence: `unproven`',
  'canonical commit, export generation, release creation, and activation are not interchangeable proof states',
  'deterministic record ordering',
  'privacy-field exclusion',
  'immutable release identity',
  'stale activation requests fail closed',
  'partial activation does not expose a mixed release',
  'rollback changes the active-release pointer only',
  'a control-plane success response alone is not externally observable publication proof',
  'no credential, service token, private canonical payload',
  'repository audit passing means only that this evidence contract is present and internally consistent',
  'p6-06 owns configured domain cutover',
]);

assertMarkers('P5-08D preservation', p508d, [
  'canonical application',
  'publication',
  'release',
  'activation',
]);

assertMarkers('PROJECT_STATUS', status, [
  'phase 6 — launch and cutover evidence',
  'p6-05 — configured public export and release evidence completed in #285 for issue #284',
  'p6-04 — configured r2 media lifecycle evidence completed in #283 for issue #282',
  '3087fe60d5b3d42061931f7e2f50e997aeda0c49',
  'p6-06',
  'domain cutover and rollback evidence',
]);

console.log('P6-05 configured public export and release evidence contract passed.');