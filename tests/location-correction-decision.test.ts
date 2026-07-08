import { describe, expect, it } from 'vitest';
import {
  createLocationCorrectionDecisionService,
  type LocationCorrectionDecisionInput,
} from '../src/admin/location-correction/decision';
import { InMemoryLocationCorrectionBackend } from '../src/admin/location-correction/in-memory-backend';
import type { CanonicalLocationInput } from '../src/schemas/canonical-identity';

const locationId = '10000000-0000-4000-8000-000000000001';
const sourceRecordId = '20000000-0000-4000-8000-000000000001';
const otherSourceRecordId = '20000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000001';
const secondRequestId = '30000000-0000-4000-8000-000000000002';
const reviewedAt = '2026-07-07T00:00:00.000Z';
const decidedAt = '2026-07-08T00:00:00.000Z';

const currentLocation: CanonicalLocationInput = {
  name: 'Reviewed Cafe Tokyo',
  slug: 'reviewed-cafe-tokyo',
  addressLine: '1-1 Example',
  locality: 'Tokyo',
  region: 'Tokyo',
  postalCode: '100-0001',
  countryCode: 'JP',
  latitude: 35.681236,
  longitude: 139.767125,
  locationStatus: 'active',
  visibility: 'hidden',
  websiteUrl: 'https://example.test/tokyo',
  phone: '+81 3 1111 1111',
  description: 'Old reviewed description.',
  openingHours: 'Mon-Fri 09:00-17:00',
  amenities: ['wifi', 'parking'],
  socialLinks: [
    {
      platform: 'instagram',
      url: 'https://social.example.test/reviewed-cafe-old',
      handle: '@oldreviewedcafe',
    },
    {
      platform: 'x',
      url: 'https://social.example.test/reviewed-cafe-x',
      handle: '@reviewedcafe',
    },
  ],
  osmType: null,
  osmId: null,
};

function backend(failBeforeCommit = false) {
  return new InMemoryLocationCorrectionBackend({
    locations: [{ id: locationId, updatedAt: reviewedAt, value: currentLocation }],
    sourceRecordIds: [sourceRecordId, otherSourceRecordId],
    failBeforeCommit: () => failBeforeCommit,
  });
}

function context(id = requestId) {
  return {
    requestId: id,
    actorId: 'admin:profile-reviewer',
    actorType: 'human' as const,
    capabilities: ['location:correct' as const],
  };
}

function input(): LocationCorrectionDecisionInput {
  return {
    locationId,
    expectedLocationUpdatedAt: reviewedAt,
    decidedAt,
    changes: {
      phone: { operation: 'set', value: '+81 3 2222 2222' },
      description: { operation: 'clear' },
      openingHours: { operation: 'set', value: 'Mon-Sun 08:00-20:00' },
      amenities: { operation: 'add', values: ['outdoor-seating'] },
      socialLinks: {
        operation: 'replace',
        values: [
          {
            platform: 'instagram',
            url: 'https://social.example.test/reviewed-cafe',
            handle: '@reviewedcafe',
          },
          {
            platform: 'x',
            url: 'https://social.example.test/reviewed-cafe-x',
            handle: '@reviewedcafe',
          },
        ],
      },
    },
    sourceRecordIds: [sourceRecordId],
    provenanceAssignments: ['phone', 'description', 'openingHours', 'amenities', 'socialLinks'].map(
      (fieldPath) => ({
        fieldPath: fieldPath as
          | 'phone'
          | 'description'
          | 'openingHours'
          | 'amenities'
          | 'socialLinks',
        sourceRecordIds: [sourceRecordId],
      }),
    ),
    reasonCode: 'reviewed_profile_correction',
    publicSummary: 'Updated practical information from the reviewed official source.',
    internalNote: null,
  };
}

describe('Location correction decision contract', () => {
  it('applies scalar set/clear and structured replace/add changes atomically with field provenance', async () => {
    const store = backend();
    const receipt = await createLocationCorrectionDecisionService(store).correct(
      context(),
      input(),
    );

    expect(receipt).toMatchObject({
      locationId,
      state: 'committed',
      updatedAt: decidedAt,
    });
    expect(receipt.appliedFieldPaths).toEqual([
      'phone',
      'description',
      'openingHours',
      'amenities',
      'socialLinks',
    ]);

    const snapshot = store.snapshot();
    expect(snapshot.locations[0]?.value).toMatchObject({
      phone: '+81 3 2222 2222',
      description: null,
      openingHours: 'Mon-Sun 08:00-20:00',
      amenities: ['wifi', 'parking', 'outdoor-seating'],
      socialLinks: [
        {
          platform: 'instagram',
          url: 'https://social.example.test/reviewed-cafe',
          handle: '@reviewedcafe',
        },
        {
          platform: 'x',
          url: 'https://social.example.test/reviewed-cafe-x',
          handle: '@reviewedcafe',
        },
      ],
    });
    expect(snapshot.provenanceRows.map((row) => row.fieldPath)).toEqual([
      'amenities',
      'description',
      'openingHours',
      'phone',
      'socialLinks',
    ]);
    expect(snapshot.provenanceRows.every((row) => row.provenanceRole === 'correction')).toBe(true);
    expect(snapshot.decisions[0]?.diff.map((row) => row.fieldPath)).toEqual(
      receipt.appliedFieldPaths,
    );
  });

  it('supports explicit remove and clear operations for structured and scalar fields', async () => {
    const store = backend();
    const correction = input();
    correction.changes = {
      websiteUrl: { operation: 'clear' },
      amenities: { operation: 'remove', values: ['parking'] },
      socialLinks: {
        operation: 'remove',
        values: [
          {
            platform: 'x',
            url: 'https://social.example.test/reviewed-cafe-x',
          },
        ],
      },
    };
    correction.provenanceAssignments = ['websiteUrl', 'amenities', 'socialLinks'].map(
      (fieldPath) => ({
        fieldPath: fieldPath as 'websiteUrl' | 'amenities' | 'socialLinks',
        sourceRecordIds: [sourceRecordId],
      }),
    );

    await createLocationCorrectionDecisionService(store).correct(context(), correction);
    expect(store.snapshot().locations[0]?.value).toMatchObject({
      websiteUrl: null,
      amenities: ['wifi'],
      socialLinks: [
        {
          platform: 'instagram',
          url: 'https://social.example.test/reviewed-cafe-old',
          handle: '@oldreviewedcafe',
        },
      ],
    });

    const secondStore = backend();
    const clear = input();
    clear.changes = {
      amenities: { operation: 'clear' },
      socialLinks: { operation: 'clear' },
    };
    clear.provenanceAssignments = ['amenities', 'socialLinks'].map((fieldPath) => ({
      fieldPath: fieldPath as 'amenities' | 'socialLinks',
      sourceRecordIds: [sourceRecordId],
    }));

    await createLocationCorrectionDecisionService(secondStore).correct(context(), clear);
    expect(secondStore.snapshot().locations[0]?.value.amenities).toEqual([]);
    expect(secondStore.snapshot().locations[0]?.value.socialLinks).toEqual([]);
  });

  it('requires exact provenance coverage for every changed field', async () => {
    const correction = input();
    correction.provenanceAssignments = correction.provenanceAssignments.filter(
      (assignment) => assignment.fieldPath !== 'description',
    );

    await expect(
      createLocationCorrectionDecisionService(backend()).correct(context(), correction),
    ).rejects.toMatchObject({
      code: 'invalid_decision',
      issues: expect.arrayContaining([
        expect.stringContaining('description requires explicit correction provenance'),
      ]),
    });
  });

  it('rejects provenance references outside the reviewed source set', async () => {
    const correction = input();
    correction.provenanceAssignments[0] = {
      fieldPath: 'phone',
      sourceRecordIds: [otherSourceRecordId],
    };

    await expect(
      createLocationCorrectionDecisionService(backend()).correct(context(), correction),
    ).rejects.toMatchObject({
      code: 'invalid_decision',
      issues: expect.arrayContaining([expect.stringContaining('outside the reviewed source set')]),
    });
  });

  it('replays identical requests and conflicts when the same request ID carries changed content', async () => {
    const store = backend();
    const service = createLocationCorrectionDecisionService(store);

    await expect(service.correct(context(), input())).resolves.toMatchObject({
      state: 'committed',
    });
    await expect(service.correct(context(), input())).resolves.toMatchObject({ state: 'replayed' });

    const changed = input();
    changed.changes.phone = { operation: 'set', value: '+81 3 3333 3333' };
    await expect(service.correct(context(), changed)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('conflicts when the canonical Location changed after review', async () => {
    const correction = input();
    correction.expectedLocationUpdatedAt = '2026-07-06T00:00:00.000Z';

    await expect(
      createLocationCorrectionDecisionService(backend()).correct(
        context(secondRequestId),
        correction,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects correction operations that do not change the canonical field value', async () => {
    const correction = input();
    correction.changes = {
      phone: { operation: 'set', value: '+81 3 1111 1111' },
    };
    correction.provenanceAssignments = [{ fieldPath: 'phone', sourceRecordIds: [sourceRecordId] }];

    await expect(
      createLocationCorrectionDecisionService(backend()).correct(context(), correction),
    ).rejects.toMatchObject({ code: 'invalid_decision' });
  });

  it('rolls back Location, provenance, and decision state when the atomic backend fails', async () => {
    const store = backend(true);
    const before = store.snapshot();

    await expect(
      createLocationCorrectionDecisionService(store).correct(context(), input()),
    ).rejects.toMatchObject({ code: 'backend_failure' });
    expect(store.snapshot()).toEqual(before);
  });
});
