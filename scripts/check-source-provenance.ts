import {
  buildSourceRecordIdentity,
  canTransitionCandidateStatus,
  duplicateGroupInputSchema,
  findCandidateDuplicateSignals,
  licenseInputSchema,
  normalizeCandidateName,
  normalizeSourceUrl,
  provenanceLinkInputSchema,
  sourceCandidateInputSchema,
  sourceLicenseContextSchema,
  sourceRecordInputSchema,
} from '../src/schemas/source-provenance';

const sourceId = '11111111-1111-4111-8111-111111111111';
const licenseId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';
const sourceRecordId = '55555555-5555-4555-8555-555555555555';

const license = {
  slug: 'odbl-1-0',
  name: 'Open Database License',
  version: '1.0',
  url: 'https://opendatacommons.org/licenses/odbl/1-0/',
  attributionRequired: true,
  shareAlike: true,
  notes: null,
};

const source = {
  sourceType: 'osm',
  name: 'OpenStreetMap',
  baseUrl: 'https://www.openstreetmap.org/',
  defaultLicenseId: licenseId,
  attributionText: '© OpenStreetMap contributors',
  isActive: true,
};

const sourceRecord = {
  sourceId,
  externalId: 'node/123',
  sourceUrl: 'https://www.openstreetmap.org/node/123',
  rawPayload: { type: 'node', id: 123, tags: { payment: 'bitcoin' } },
  observedAt: '2026-06-20T00:00:00Z',
  publishedAt: null,
  fetchedAt: '2026-06-21T00:00:00Z',
  contentHash: 'abc123',
  archiveUrl: null,
  licenseId,
};

const candidate = {
  candidateType: 'physical_place',
  normalizedName: 'example coffee',
  candidateStatus: 'promoted',
  priority: 100,
  duplicateGroupId: null,
  firstSeenAt: '2026-06-20T00:00:00Z',
  lastSeenAt: '2026-06-21T00:00:00Z',
  importBatchId: null,
  canonicalEntityId: null,
  canonicalLocationId: locationId,
};

const provenance = {
  subjectType: 'location',
  subjectId: locationId,
  fieldPath: 'address_line',
  sourceRecordId,
  licenseId,
  provenanceRole: 'origin',
  effectiveFrom: '2026-06-20T00:00:00Z',
  effectiveTo: null,
};

const checks = [
  licenseInputSchema.safeParse(license),
  sourceLicenseContextSchema.safeParse({ source, defaultLicense: license }),
  sourceRecordInputSchema.safeParse(sourceRecord),
  duplicateGroupInputSchema.safeParse({ status: 'open', resolutionNote: null, resolvedAt: null }),
  sourceCandidateInputSchema.safeParse(candidate),
  provenanceLinkInputSchema.safeParse(provenance),
];

const failures = checks.filter((result) => !result.success);
if (failures.length > 0) {
  const issues = failures.flatMap((failure) => (failure.success ? [] : failure.error.issues));
  throw new Error(`Source provenance checks failed: ${JSON.stringify(issues)}`);
}

const invalidSourceContexts = [
  {
    source: { ...source, attributionText: null },
    defaultLicense: license,
  },
  {
    source: { ...source, defaultLicenseId: null },
    defaultLicense: license,
  },
];
if (invalidSourceContexts.some((value) => sourceLicenseContextSchema.safeParse(value).success)) {
  throw new Error('Invalid source-license context was accepted.');
}

const invalidSourceRecords = [
  { ...sourceRecord, externalId: null, sourceUrl: null, contentHash: null },
  {
    ...sourceRecord,
    externalId: 'node/124',
    sourceUrl: null,
    archiveUrl: 'https://archive.example/node-124',
  },
];
if (invalidSourceRecords.some((value) => sourceRecordInputSchema.safeParse(value).success)) {
  throw new Error('Invalid source record was accepted.');
}

const invalidCandidates = [
  { ...candidate, normalizedName: 'Example Coffee' },
  {
    ...candidate,
    firstSeenAt: '2026-06-22T00:00:00Z',
    lastSeenAt: '2026-06-21T00:00:00Z',
  },
  { ...candidate, candidateType: 'online_service', canonicalLocationId: locationId },
  { ...candidate, canonicalLocationId: null },
  {
    ...candidate,
    candidateStatus: 'duplicate',
    canonicalLocationId: null,
    duplicateGroupId: null,
  },
];
if (invalidCandidates.some((value) => sourceCandidateInputSchema.safeParse(value).success)) {
  throw new Error('Invalid source candidate was accepted.');
}

if (
  duplicateGroupInputSchema.safeParse({
    status: 'resolved',
    resolutionNote: 'Merged into the canonical candidate.',
    resolvedAt: null,
  }).success
) {
  throw new Error('Resolved duplicate group without a resolution time was accepted.');
}

if (
  provenanceLinkInputSchema.safeParse({
    ...provenance,
    fieldPath: 'Address Line',
  }).success ||
  provenanceLinkInputSchema.safeParse({
    ...provenance,
    effectiveFrom: '2026-06-22T00:00:00Z',
    effectiveTo: '2026-06-21T00:00:00Z',
  }).success
) {
  throw new Error('Invalid provenance link was accepted.');
}

if (normalizeCandidateName(' Café & Bar—Tokyo ') !== 'café and bar tokyo') {
  throw new Error('Candidate-name normalization failed.');
}

if (
  normalizeSourceUrl('https://EXAMPLE.com/path/?b=2&a=1#section') !==
  'https://example.com/path?a=1&b=2'
) {
  throw new Error('Source URL normalization failed.');
}

const externalIdentity = buildSourceRecordIdentity({
  sourceId,
  externalId: 'node/123',
  sourceUrl: sourceRecord.sourceUrl,
  contentHash: sourceRecord.contentHash,
});
const urlIdentity = buildSourceRecordIdentity({
  sourceId,
  externalId: null,
  sourceUrl: 'https://EXAMPLE.com/path/?b=2&a=1#section',
  contentHash: null,
});
const hashIdentity = buildSourceRecordIdentity({
  sourceId,
  externalId: null,
  sourceUrl: null,
  contentHash: 'ABC123',
});

if (
  externalIdentity !== `${sourceId}:external:node/123` ||
  urlIdentity !== `${sourceId}:url:https://example.com/path?a=1&b=2` ||
  hashIdentity !== `${sourceId}:hash:abc123`
) {
  throw new Error('Source-record identity generation failed.');
}

const duplicateSignals = findCandidateDuplicateSignals([
  {
    candidateId: 'candidate-a',
    candidateType: 'physical_place',
    normalizedName: 'example coffee',
    sourceIdentities: ['source:external:1'],
  },
  {
    candidateId: 'candidate-b',
    candidateType: 'physical_place',
    normalizedName: 'other coffee',
    sourceIdentities: ['source:external:1'],
  },
  {
    candidateId: 'candidate-c',
    candidateType: 'physical_place',
    normalizedName: 'example coffee',
    sourceIdentities: ['source:external:2'],
  },
  {
    candidateId: 'candidate-d',
    candidateType: 'online_service',
    normalizedName: 'example coffee',
    sourceIdentities: ['source:external:1'],
  },
]);

if (
  duplicateSignals.length !== 2 ||
  duplicateSignals[0]?.reason !== 'shared_source_identity' ||
  duplicateSignals[0]?.strength !== 'strong' ||
  duplicateSignals[1]?.reason !== 'same_normalized_name' ||
  duplicateSignals[1]?.strength !== 'review'
) {
  throw new Error('Candidate duplicate signal generation failed.');
}

if (
  !canTransitionCandidateStatus('new', 'triaged') ||
  !canTransitionCandidateStatus('linked', 'promoted') ||
  !canTransitionCandidateStatus('duplicate', 'triaged') ||
  canTransitionCandidateStatus('new', 'promoted') ||
  canTransitionCandidateStatus('promoted', 'new')
) {
  throw new Error('Candidate status transition rules are inconsistent.');
}

console.log('Source provenance checks passed.');
