import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const matrixPath = 'docs/P5_08A_MVP_B_INTEGRATION_AUDIT_MATRIX.md';
const statusPath = 'docs/PROJECT_STATUS.md';

const [matrix, status] = await Promise.all([
  readFile(matrixPath, 'utf8'),
  readFile(statusPath, 'utf8'),
]);

const submissionFamilies = [
  'Suggest',
  'Payment Report',
  'Problem Report',
  'Business Claim',
  'Photos',
];

for (const family of submissionFamilies) {
  assert.ok(
    matrix.includes(`| ${family} |`),
    `P5-08A audit failed: missing Submission family matrix row: ${family}`,
  );
}

const crossCuttingRequirements = [
  'Public requests cannot mutate Candidate, canonical, export, release, or public state directly.',
  'Status reads require the opaque public reference and valid follow-up secret.',
  'Final decisions are exact-state guarded and replay-safe.',
  'Application completion and publication completion remain separate.',
  'Private retention cannot mutate canonical facts',
  'partial failures fail closed',
];

for (const requirement of crossCuttingRequirements) {
  assert.ok(
    matrix.includes(requirement),
    `P5-08A audit failed: missing cross-cutting requirement: ${requirement}`,
  );
}

const sequence = ['P5-08A', 'P5-08B', 'P5-08C', 'P5-08D', 'P5-08E', 'P5-08F'];
for (const item of sequence) {
  assert.ok(
    matrix.includes(`| ${item} |`),
    `P5-08A audit failed: missing bounded audit sequence item: ${item}`,
  );
}

const configuredEvidence = [
  'live Cloudflare Access identity',
  'live Neon migration and transaction execution',
  'R2 conditional writes and publication behavior',
  'production scheduler binding for retention',
  'production restore persistence',
];

for (const evidence of configuredEvidence) {
  assert.ok(
    matrix.includes(evidence),
    `P5-08A audit failed: missing configured-environment launch gate: ${evidence}`,
  );
}

const statusRequirements = [
  'P5-08A — MVP-B integration audit matrix and repository handoff',
  'P5-07 is repository-complete.',
  'c3f6049e96df5c29201bec61fc3c7374ae322846',
  'Issue #264',
  'No repository blocker is known.',
];

for (const requirement of statusRequirements) {
  assert.ok(
    status.includes(requirement),
    `P5-08A audit failed: project status is missing: ${requirement}`,
  );
}

console.log(
  JSON.stringify(
    {
      audit: 'P5-08A',
      result: 'pass',
      submissionFamilies,
      sequence,
      repositoryEvidenceSeparatedFromConfiguredLaunchEvidence: true,
      files: [matrixPath, statusPath],
    },
    null,
    2,
  ),
);
