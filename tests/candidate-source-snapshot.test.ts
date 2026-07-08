import { describe, expect, it } from 'vitest';
import { projectCandidateSourceSnapshot } from '../src/admin/candidates/source-snapshot';

const physicalRecord = {
  legacyId: 'place-1',
  legacyPath: '/place/place-1',
  name: 'Example Cafe',
  addressLine: '1 Example Street',
  locality: 'Tokyo',
  region: null,
  postalCode: null,
  countryCode: 'JP',
  latitude: 35.68,
  longitude: 139.76,
  category: 'cafe',
  websiteUrl: 'https://example.test',
  phone: '+81 3 0000 0000',
  description: 'Example practical source description.',
  openingHours: 'Mon-Fri 08:00-18:00',
  amenities: ['wifi', 'outdoor-seating'],
  socialLinks: [
    {
      platform: 'instagram',
      url: 'https://social.example.test/example-cafe',
      handle: '@examplecafe',
    },
    {
      platform: 'x',
      url: null,
      handle: '@examplecafe',
    },
  ],
  osmType: 'node',
  osmId: '123',
  paymentTags: { 'payment:bitcoin': 'yes' },
  observedAt: '2026-06-20T00:00:00.000Z',
  sourceUrl: 'https://source.example.test/place-1',
  legacyVerificationLabel: 'legacy verified',
};

const onlineRecord = {
  legacyId: 'service-1',
  legacyPath: '/online/service-1',
  recordType: 'online_service',
  name: 'Example Service',
  websiteUrl: 'https://service.example.test',
  countryCode: 'US',
  category: 'software',
  acceptanceScope: 'all_checkout',
  routeType: 'direct_wallet',
  processorName: null,
  processorUrl: null,
  assetLabels: ['BTC'],
  networkLabels: ['Bitcoin'],
  paymentMethodLabels: ['onchain'],
  scopeNotes: null,
  howToPay: 'Choose Bitcoin at checkout.',
  evidenceUrls: ['https://service.example.test/payments'],
  observedAt: '2026-06-20T00:00:00.000Z',
  sourceUrl: 'https://service.example.test/payments',
  legacyVerificationLabel: null,
};

describe('Candidate source snapshot projection', () => {
  it('projects only allowlisted physical-place fields including practical review values', () => {
    const snapshot = projectCandidateSourceSnapshot('physical_place', {
      rawRecord: { privateExtra: 'must not escape' },
      normalizedRecord: physicalRecord,
      unexpected: 'must not escape',
    });

    expect(snapshot).toMatchObject({
      kind: 'physical_place',
      name: 'Example Cafe',
      countryCode: 'JP',
      phone: '+81 3 0000 0000',
      description: 'Example practical source description.',
      openingHours: 'Mon-Fri 08:00-18:00',
      amenities: ['wifi', 'outdoor-seating'],
      socialLinks: [
        {
          platform: 'instagram',
          url: 'https://social.example.test/example-cafe',
          handle: '@examplecafe',
        },
        {
          platform: 'x',
          url: null,
          handle: '@examplecafe',
        },
      ],
      paymentTags: { 'payment:bitcoin': 'yes' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('privateExtra');
    expect(JSON.stringify(snapshot)).not.toContain('unexpected');
    expect(JSON.stringify(snapshot)).not.toContain('legacyId');
  });

  it('normalizes duplicate amenities and exact duplicate social links deterministically', () => {
    const snapshot = projectCandidateSourceSnapshot('physical_place', {
      normalizedRecord: {
        ...physicalRecord,
        amenities: ['wifi', 'wifi', 'outdoor-seating'],
        socialLinks: [physicalRecord.socialLinks[0], physicalRecord.socialLinks[0]],
      },
    });

    expect(snapshot).toMatchObject({
      amenities: ['wifi', 'outdoor-seating'],
      socialLinks: [physicalRecord.socialLinks[0]],
    });
  });

  it('returns null for malformed practical source values instead of leaking a partial snapshot', () => {
    expect(
      projectCandidateSourceSnapshot('physical_place', {
        normalizedRecord: { ...physicalRecord, socialLinks: [{ platform: 'x' }] },
      }),
    ).toBeNull();
    expect(
      projectCandidateSourceSnapshot('physical_place', {
        normalizedRecord: { ...physicalRecord, amenities: [{ privateNote: 'must not escape' }] },
      }),
    ).toBeNull();
  });

  it('projects an online snapshot only when the Candidate type matches', () => {
    expect(
      projectCandidateSourceSnapshot('online_service', { normalizedRecord: onlineRecord }),
    ).toMatchObject({
      kind: 'online_service',
      recordType: 'online_service',
      name: 'Example Service',
      assetLabels: ['BTC'],
    });
    expect(
      projectCandidateSourceSnapshot('payment_processor', { normalizedRecord: onlineRecord }),
    ).toBeNull();
  });

  it('returns null for unknown or invalid payloads', () => {
    expect(projectCandidateSourceSnapshot('physical_place', { other: true })).toBeNull();
    expect(
      projectCandidateSourceSnapshot('physical_place', { normalizedRecord: { name: 'partial' } }),
    ).toBeNull();
  });
});
