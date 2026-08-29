import { describe, expect, it } from 'vitest';
import type { ExistingCandidateSnapshot } from '../src/importers/candidate-acquisition-reconciliation';
import {
  CandidateIngestionPersistenceError,
  type CandidateIngestionPersistencePlan,
} from '../src/importers/candidate-ingestion-persistence';
import { createOsmOverpassCandidateAcquisitionPlan } from '../src/importers/osm-overpass-candidate-acquisition';

const IDS = {
  requestId: '00000000-0000-4000-8000-000000000101',
  importBatchId: '00000000-0000-4000-8000-000000000102',
  sourceId: '00000000-0000-4000-8000-000000000103',
  licenseId: '00000000-0000-4000-8000-000000000104',
};

const fetchedAt = new Date('2026-08-28T01:00:00.000Z');
const exampleElement = {
  type: 'node' as const,
  id: 123,
  lat: 35.6812,
  lon: 139.7671,
  tags: {
    name: 'Example Cafe',
    website: 'https://example.test/',
    'payment:bitcoin': 'yes',
  },
};

type DuplicateAwareExistingCandidateSnapshot = ExistingCandidateSnapshot & {
  duplicateGroupId?: string | null;
  duplicateGroupStatus?: 'open' | 'resolved' | 'dismissed' | null;
};

async function existingSnapshot(): Promise<DuplicateAwareExistingCandidateSnapshot> {
  const result = await createOsmOverpassCandidateAcquisitionPlan({
    ...IDS,
    fetchedAt,
    importerVersion: '1.0.0',
    elements: [exampleElement],
  });
  const candidate = result.plan.candidates[0];
  const sourceRecord = result.plan.sourceRecords[0];
  if (
    candidate?.id == null ||
    sourceRecord?.externalId == null ||
    sourceRecord.contentHash == null
  ) {
    throw new Error('Expected complete fixture Candidate/source identity.');
  }
  return {
    candidateId: candidate.id,
    sourceId: sourceRecord.sourceId,
    externalId: sourceRecord.externalId,
    contentHash: sourceRecord.contentHash,
    normalizedName: candidate.normalizedName,
    latitude: exampleElement.lat,
    longitude: exampleElement.lon,
    officialDomain: 'example.test',
    candidateStatus: 'new',
    duplicateGroupId: null,
  };
}

function crossBatchDuplicate(
  duplicateGroupId: string | null = null,
  duplicateGroupStatus: 'open' | 'resolved' | 'dismissed' | null = duplicateGroupId === null
    ? null
    : 'open',
): DuplicateAwareExistingCandidateSnapshot {
  return {
    candidateId: '00000000-0000-4000-8000-000000000201',
    sourceId: '00000000-0000-4000-8000-000000000202',
    externalId: 'node:999',
    contentHash: 'd'.repeat(64),
    normalizedName: 'example cafe',
    latitude: exampleElement.lat,
    longitude: exampleElement.lon,
    officialDomain: 'other-source.example',
    candidateStatus: 'new',
    duplicateGroupId,
    duplicateGroupStatus,
  };
}

function duplicatePlan(result: { plan: CandidateIngestionPersistencePlan }) {
  const group = result.plan.duplicateGroups?.[0];
  const signal = result.plan.duplicateSignals?.[0];
  const assignment = result.plan.existingCandidateDuplicateAssignments?.[0];
  if (group?.id == null || signal?.id == null || assignment === undefined) {
    throw new Error('Expected complete duplicate persistence work.');
  }
  return { group, signal, assignment };
}

describe('OSM Overpass Candidate acquisition', () => {
  it('creates Candidate-only persistence rows with provenance and no automatic confirmation', async () => {
    const result = await createOsmOverpassCandidateAcquisitionPlan({
      ...IDS,
      fetchedAt,
      importerVersion: '1.0.0',
      elements: [exampleElement],
    });

    expect(result.rejected).toEqual([]);
    expect(result.plan.batch.acceptedCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
    expect(result.plan.candidates[0]?.candidateStatus).toBe('new');
    expect(result.plan.candidates[0]?.canonicalEntityId).toBeNull();
    expect(result.plan.candidates[0]?.canonicalLocationId).toBeNull();
    expect(result.plan.sourceRecords[0]?.sourceUrl).toBe('https://www.openstreetmap.org/node/123');
    expect(result.plan.sourceRecords[0]?.licenseId).toBe(IDS.licenseId);
    expect(result.plan.sourceRecords[0]?.officialDomain).toBe('example.test');
    expect(result.plan.candidateSourceRecords).toHaveLength(1);
    expect(result.plan.sourceRefreshes).toHaveLength(0);
    expect(result.plan.existingCandidateDuplicateAssignments).toHaveLength(0);
    expect(result.reconciliation.newSeeds).toHaveLength(1);
  });

  it('reconciles an unchanged repeat source identity without creating another Candidate row', async () => {
    const existing = await existingSnapshot();
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000105',
        importBatchId: '00000000-0000-4000-8000-000000000106',
        fetchedAt: new Date('2026-08-29T01:00:00.000Z'),
        importerVersion: '1.0.0',
        elements: [exampleElement],
      },
      [existing],
    );

    expect(result.reconciliation.unchangedSeeds).toHaveLength(1);
    expect(result.reconciliation.changedSeeds).toHaveLength(0);
    expect(result.plan.candidates).toHaveLength(0);
    expect(result.plan.sourceRecords).toHaveLength(0);
    expect(result.plan.candidateSourceRecords).toHaveLength(0);
    expect(result.plan.sourceRefreshes).toHaveLength(0);
    expect(result.plan.batch.acceptedCount).toBe(0);
    expect(result.plan.batch.replayedCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

  it('persists changed repeat-source content as bounded refresh work instead of a new Candidate row', async () => {
    const existing = await existingSnapshot();
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000107',
        importBatchId: '00000000-0000-4000-8000-000000000108',
        fetchedAt: new Date('2026-08-29T01:00:00.000Z'),
        importerVersion: '1.0.0',
        elements: [
          {
            ...exampleElement,
            tags: {
              ...exampleElement.tags,
              website: 'https://changed.example.test/path',
              phone: '+81-00-0000-0000',
            },
          },
        ],
      },
      [existing],
    );

    expect(result.reconciliation.changedSeeds).toHaveLength(1);
    expect(result.reconciliation.newSeeds).toHaveLength(0);
    expect(result.plan.candidates).toHaveLength(0);
    expect(result.plan.sourceRecords).toHaveLength(0);
    expect(result.plan.candidateSourceRecords).toHaveLength(0);
    expect(result.plan.sourceRefreshes).toHaveLength(1);
    expect(result.plan.sourceRefreshes?.[0]?.candidateId).toBe(existing.candidateId);
    expect(result.plan.sourceRefreshes?.[0]?.expectedContentHash).toBe(existing.contentHash);
    expect(result.plan.sourceRefreshes?.[0]?.contentHash).not.toBe(existing.contentHash);
    expect(result.plan.sourceRefreshes?.[0]?.officialDomain).toBe('changed.example.test');
    expect(result.plan.batch.acceptedCount).toBe(1);
    expect(result.plan.batch.replayedCount).toBe(0);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

  it('creates a reviewable duplicate group for a cross-batch same-name same-coordinate Candidate', async () => {
    const existing = crossBatchDuplicate();
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000109',
        importBatchId: '00000000-0000-4000-8000-000000000110',
        fetchedAt: new Date('2026-08-29T02:00:00.000Z'),
        importerVersion: '1.0.0',
        elements: [exampleElement],
      },
      [existing],
    );
    const { group, signal, assignment } = duplicatePlan(result);

    expect(result.reconciliation.duplicateSignals).toHaveLength(1);
    expect(signal.reason).toBe('same_name_and_coordinates');
    expect(signal.strength).toBe('strong');
    expect(signal.duplicateGroupId).toBe(group.id);
    expect(signal.importBatchId).toBe(result.plan.batch.id);
    expect(assignment.candidateId).toBe(existing.candidateId);
    expect(assignment.duplicateGroupId).toBe(group.id);
    expect(result.plan.candidates[0]?.duplicateGroupId).toBe(group.id);
    expect(result.plan.batch.duplicateSignalCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

  it('creates a cross-batch duplicate signal from a shared indexed official domain even when names differ', async () => {
    const existing = {
      ...crossBatchDuplicate(),
      normalizedName: 'different merchant name',
      latitude: 34.5,
      longitude: 135.5,
      officialDomain: 'example.test',
    };
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000113',
        importBatchId: '00000000-0000-4000-8000-000000000114',
        fetchedAt: new Date('2026-08-29T02:30:00.000Z'),
        importerVersion: '1.0.0',
        elements: [exampleElement],
      },
      [existing],
    );
    const { signal, assignment } = duplicatePlan(result);

    expect(result.reconciliation.duplicateSignals).toHaveLength(1);
    expect(signal.reason).toBe('shared_official_domain');
    expect(signal.strength).toBe('review');
    expect(assignment.candidateId).toBe(existing.candidateId);
    expect(result.plan.batch.duplicateSignalCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

  it('reuses one existing open duplicate group without recreating or reassigning it', async () => {
    const duplicateGroupId = '00000000-0000-4000-8000-000000000203';
    const existing = crossBatchDuplicate(duplicateGroupId, 'open');
    const result = await createOsmOverpassCandidateAcquisitionPlan(
      {
        ...IDS,
        requestId: '00000000-0000-4000-8000-000000000111',
        importBatchId: '00000000-0000-4000-8000-000000000112',
        fetchedAt: new Date('2026-08-29T03:00:00.000Z'),
        importerVersion: '1.0.0',
        elements: [exampleElement],
      },
      [existing],
    );
    expect(result.plan.duplicateGroups).toHaveLength(0);
    expect(result.plan.existingCandidateDuplicateAssignments).toHaveLength(0);
    expect(result.plan.candidates[0]?.duplicateGroupId).toBe(duplicateGroupId);
    expect(result.plan.duplicateSignals?.[0]?.duplicateGroupId).toBe(duplicateGroupId);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
  });

  it('fails closed when a cross-batch component spans multiple existing duplicate groups', async () => {
    const left = crossBatchDuplicate('00000000-0000-4000-8000-000000000203', 'open');
    const right = {
      ...crossBatchDuplicate('00000000-0000-4000-8000-000000000204', 'open'),
      candidateId: '00000000-0000-4000-8000-000000000205',
      sourceId: '00000000-0000-4000-8000-000000000206',
      externalId: 'node:998',
    };
    await expect(
      createOsmOverpassCandidateAcquisitionPlan(
        {
          ...IDS,
          requestId: '00000000-0000-4000-8000-000000000115',
          importBatchId: '00000000-0000-4000-8000-000000000116',
          fetchedAt: new Date('2026-08-29T03:15:00.000Z'),
          importerVersion: '1.0.0',
          elements: [exampleElement],
        },
        [left, right],
      ),
    ).rejects.toThrowError(CandidateIngestionPersistenceError);
  });

  it('fails closed instead of extending a resolved duplicate group', async () => {
    const existing = crossBatchDuplicate('00000000-0000-4000-8000-000000000203', 'resolved');
    await expect(
      createOsmOverpassCandidateAcquisitionPlan(
        {
          ...IDS,
          requestId: '00000000-0000-4000-8000-000000000117',
          importBatchId: '00000000-0000-4000-8000-000000000118',
          fetchedAt: new Date('2026-08-29T03:30:00.000Z'),
          importerVersion: '1.0.0',
          elements: [exampleElement],
        },
        [existing],
      ),
    ).rejects.toThrowError(CandidateIngestionPersistenceError);
  });

  it('rejects thin or invalid rows instead of inventing publishable data', async () => {
    const result = await createOsmOverpassCandidateAcquisitionPlan({
      ...IDS,
      fetchedAt,
      importerVersion: '1.0.0',
      elements: [
        { type: 'node', id: 1, lat: 35, lon: 139, tags: {} },
        { type: 'way', id: 2, tags: { name: 'No coordinates' } },
        { type: 'node', id: 3, lat: 200, lon: 139, tags: { name: 'Bad coordinates' } },
      ],
    });

    expect(result.plan.batch.acceptedCount).toBe(0);
    expect(result.plan.batch.rejectedCount).toBe(3);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      'missing_name',
      'missing_coordinates',
      'invalid_coordinates',
    ]);
  });
});
