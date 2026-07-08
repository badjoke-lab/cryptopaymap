import { describe, expect, it } from 'vitest';
import { createDrizzleLocationCorrectionBackend } from '../src/admin/location-correction/drizzle-backend';
import { locationProfileCorrectionDecisions, provenanceLinks } from '../src/db/schema';

describe('Location correction persistence foundation', () => {
  it('exposes durable replay, diff, source, provenance, and reviewer columns', () => {
    expect(locationProfileCorrectionDecisions.requestId.name).toBe('request_id');
    expect(locationProfileCorrectionDecisions.locationId.name).toBe('location_id');
    expect(locationProfileCorrectionDecisions.expectedLocationUpdatedAt.name).toBe(
      'expected_location_updated_at',
    );
    expect(locationProfileCorrectionDecisions.changedFieldPaths.name).toBe('changed_field_paths');
    expect(locationProfileCorrectionDecisions.beforeValues.name).toBe('before_values');
    expect(locationProfileCorrectionDecisions.afterValues.name).toBe('after_values');
    expect(locationProfileCorrectionDecisions.sourceRecordIds.name).toBe('source_record_ids');
    expect(locationProfileCorrectionDecisions.provenanceAssignments.name).toBe(
      'provenance_assignments',
    );
    expect(locationProfileCorrectionDecisions.requestFingerprint.name).toBe('request_fingerprint');
  });

  it('uses the shared provenance period columns and exports the production backend factory', () => {
    expect(provenanceLinks.effectiveFrom.name).toBe('effective_from');
    expect(provenanceLinks.effectiveTo.name).toBe('effective_to');
    expect(createDrizzleLocationCorrectionBackend).toBeTypeOf('function');
  });
});
