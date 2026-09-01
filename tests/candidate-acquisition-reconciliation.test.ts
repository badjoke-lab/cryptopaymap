import { describe, expect, it } from 'vitest';
import {
  reconcileCandidateAcquisition,
  type ExistingCandidateSnapshot,
} from '../src/importers/candidate-acquisition-reconciliation';

const existingCandidate: ExistingCandidateSnapshot = {
  candidateId: '00000000-0000-4000-8000-000000000301',
  sourceId: '00000000-0000-4000-8000-000000000311',
  externalId: 'node:100',
  contentHash: 'hash-old',
  normalizedName: 'example cafe',
  latitude: 35.6812,
  longitude: 139.7671,
  officialDomain: 'example.test',
  candidateStatus: 'new',
};
const existing: ExistingCandidateSnapshot[] = [existingCandidate];

describe('Candidate acquisition reconciliation', () => {
  it('classifies exact repeated source data as unchanged instead of a new Candidate', () => {
    const result = reconcileCandidateAcquisition([{ ...existingCandidate, contentHash: 'hash-old' }], existing);
    expect(result.newSeeds).toHaveLength(0);
    expect(result.unchangedSeeds).toHaveLength(1);
    expect(result.changedSeeds).toHaveLength(0);
    expect(result.automaticConfirmedCount).toBe(0);
  });

  it('classifies changed content for the same external source identity as refresh work', () => {
    const result = reconcileCandidateAcquisition([{ ...existingCandidate, contentHash: 'hash-new' }], existing);
    expect(result.newSeeds).toHaveLength(0);
    expect(result.unchangedSeeds).toHaveLength(0);
    expect(result.changedSeeds).toHaveLength(1);
    expect(result.changedSeeds[0]?.existing.contentHash).toBe('hash-old');
    expect(result.changedSeeds[0]?.incoming.contentHash).toBe('hash-new');
    expect(result.automaticConfirmedCount).toBe(0);
  });

  it('emits a strong duplicate signal for a new cross-source Candidate at the same named location', () => {
    const result = reconcileCandidateAcquisition(
      [{
        candidateId: '00000000-0000-4000-8000-000000000302',
        sourceId: '00000000-0000-4000-8000-000000000312',
        externalId: 'merchant:42',
        contentHash: 'hash-directory',
        normalizedName: 'example cafe',
        latitude: 35.68121,
        longitude: 139.76709,
        officialDomain: 'example.test',
      }],
      existing,
    );
    expect(result.duplicateSignals).toEqual([{
      leftCandidateId: '00000000-0000-4000-8000-000000000301',
      rightCandidateId: '00000000-0000-4000-8000-000000000302',
      reason: 'same_name_and_coordinates',
      strength: 'strong',
    }]);
  });

  it('does not group distant chain locations merely because name and official domain match', () => {
    const result = reconcileCandidateAcquisition(
      [{
        candidateId: '00000000-0000-4000-8000-000000000303',
        sourceId: '00000000-0000-4000-8000-000000000313',
        externalId: 'merchant:43',
        contentHash: 'hash-chain-location',
        normalizedName: 'example cafe',
        latitude: 40.7128,
        longitude: -74.006,
        officialDomain: 'example.test',
      }],
      existing,
    );
    expect(result.newSeeds).toHaveLength(1);
    expect(result.duplicateSignals).toEqual([]);
  });
});
