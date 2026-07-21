import { readFileSync, writeFileSync } from 'node:fs';

const servicePath = 'src/admin/submissions/business-claim-field-provenance.ts';
let service = readFileSync(servicePath, 'utf8');
const serviceMarker = `function mapCommitError(error: unknown): never {
  if (error instanceof SubmissionPersistenceError) {`;
const serviceReplacement = `function mapCommitError(error: unknown): never {
  if (error instanceof BusinessClaimFieldProvenanceError) throw error;
  if (error instanceof SubmissionPersistenceError) {`;
if (!service.includes(serviceReplacement)) {
  if (!service.includes(serviceMarker)) throw new Error('mapCommitError marker is missing.');
  service = service.replace(serviceMarker, serviceReplacement);
  writeFileSync(servicePath, service);
}

const testPath = 'tests/business-claim-field-provenance.test.ts';
let test = readFileSync(testPath, 'utf8');
const importMarker = `  completeBusinessClaimFieldProvenance,
  type BusinessClaimFieldProvenanceBackend,`;
const importReplacement = `  completeBusinessClaimFieldProvenance,
  BusinessClaimFieldProvenanceError,
  type BusinessClaimFieldProvenanceBackend,`;
if (!test.includes(importReplacement)) {
  if (!test.includes(importMarker)) throw new Error('race error import marker is missing.');
  test = test.replace(importMarker, importReplacement);
}
const testMarker = `  it('fails closed when another active correction provenance owner exists', async () => {`;
const testBlock = `  it('preserves a backend idempotency conflict raised during a commit race', async () => {
    const store = new Store(baseState());
    store.commitFieldProvenance = async () => {
      throw new BusinessClaimFieldProvenanceError(
        'idempotency_conflict',
        'simulated changed-content race',
      );
    };
    await expect(
      completeBusinessClaimFieldProvenance(
        context,
        store,
        submissionId,
        sourceId,
        request(),
        completedAt,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

`;
if (!test.includes(testBlock)) {
  if (!test.includes(testMarker)) throw new Error('race test marker is missing.');
  test = test.replace(testMarker, testBlock + testMarker);
}
writeFileSync(testPath, test);

const auditPath = 'scripts/check-business-claim-field-provenance.mjs';
let audit = readFileSync(auditPath, 'utf8');
const auditMarker = `    'replays the exact request',
    'active correction provenance owner',`;
const auditReplacement = `    'replays the exact request',
    'backend idempotency conflict raised during a commit race',
    'active correction provenance owner',`;
if (!audit.includes(auditReplacement)) {
  if (!audit.includes(auditMarker)) throw new Error('audit race marker is missing.');
  audit = audit.replace(auditMarker, auditReplacement);
  writeFileSync(auditPath, audit);
}
