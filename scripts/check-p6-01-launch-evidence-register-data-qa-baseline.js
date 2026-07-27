import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [doc, status, launchCriteria] = await Promise.all([
  readFile('docs/P6_01_LAUNCH_EVIDENCE_REGISTER_DATA_QA_BASELINE.md', 'utf8'),
  readFile('docs/PROJECT_STATUS.md', 'utf8'),
  readFile('docs/LAUNCH_CRITERIA.md', 'utf8'),
]);

for (const state of ['unproven', 'blocked', 'failed', 'expired', 'passed']) {
  assert.ok(doc.includes(`\`${state}\``), `P6-01 audit failed: missing evidence state ${state}`);
}

for (const environment of [
  'Repository-executable',
  'Configured staging',
  'Configured production',
  'Manual device',
  'Operational drill',
]) {
  assert.ok(doc.includes(environment), `P6-01 audit failed: missing evidence environment ${environment}`);
}

for (const domain of [
  'Data QA',
  'Legacy export',
  'Migration audit',
  'License audit',
  'Privacy audit',
  'Mobile QA',
  'Accessibility QA',
  'Performance QA',
  'Security QA',
  'Redirects',
  'Sitemap and robots',
  'Domain cutover',
  'Backup',
  'Rollback',
  'Monitoring',
]) {
  assert.ok(doc.includes(`| ${domain} |`), `P6-01 audit failed: missing launch domain ${domain}`);
}

for (const baseline of [
  'Canonical integrity',
  'Public projection integrity',
  'Provenance and license integrity',
  'Migration integrity',
  'Candidate exclusion',
  'Publication-state consistency',
]) {
  assert.ok(doc.includes(baseline), `P6-01 audit failed: missing data QA baseline ${baseline}`);
}

for (const marker of [
  'P5-08A',
  'P5-08B',
  'P5-08C',
  'P5-08D',
  'P5-08E',
  'P5-08F',
  'P6-01',
  'P6-02',
  'No repository blocker is known.',
]) {
  assert.ok(status.includes(marker), `P6-01 audit failed: project status marker missing: ${marker}`);
}

for (const criterion of [
  'Quality before volume.',
  'Candidate records do not appear in:',
  'public files are generated from explicit allowlisted projections;',
  'old service remains recoverable through cutover',
]) {
  assert.ok(launchCriteria.includes(criterion), `P6-01 audit failed: launch criterion missing: ${criterion}`);
}

assert.ok(
  doc.includes('Documentation presence, implementation presence, or a previously successful unrelated workflow is insufficient.'),
  'P6-01 audit failed: documentation-only pass prohibition missing.',
);

console.log(JSON.stringify({ audit: 'P6-01', result: 'pass', launchEvidenceRegister: true, dataQaBaseline: true }, null, 2));