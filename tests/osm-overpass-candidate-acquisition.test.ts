import { describe, expect, it } from 'vitest';
import { createOsmOverpassCandidateAcquisitionPlan } from '../src/importers/osm-overpass-candidate-acquisition';

const IDS = {
  requestId: '00000000-0000-4000-8000-000000000101',
  importBatchId: '00000000-0000-4000-8000-000000000102',
  sourceId: '00000000-0000-4000-8000-000000000103',
  licenseId: '00000000-0000-4000-8000-000000000104',
};

const fetchedAt = new Date('2026-08-28T01:00:00.000Z');

describe('OSM Overpass Candidate acquisition', () => {
  it('creates Candidate-only persistence rows with provenance and no automatic confirmation', async () => {
    const result = await createOsmOverpassCandidateAcquisitionPlan({
      ...IDS,
      fetchedAt,
      importerVersion: '1.0.0',
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 35.6812,
          lon: 139.7671,
          tags: {
            name: 'Example Cafe',
            website: 'https://example.test/',
            'payment:bitcoin': 'yes',
          },
        },
      ],
    });

    expect(result.rejected).toEqual([]);
    expect(result.plan.batch.acceptedCount).toBe(1);
    expect(result.plan.batch.automaticConfirmedCount).toBe(0);
    expect(result.plan.candidates[0]?.candidateStatus).toBe('new');
    expect(result.plan.candidates[0]?.canonicalEntityId).toBeNull();
    expect(result.plan.candidates[0]?.canonicalLocationId).toBeNull();
    expect(result.plan.sourceRecords[0]?.sourceUrl).toBe(
      'https://www.openstreetmap.org/node/123',
    );
    expect(result.plan.sourceRecords[0]?.licenseId).toBe(IDS.licenseId);
    expect(result.plan.candidateSourceRecords).toHaveLength(1);
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
