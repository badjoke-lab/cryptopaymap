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
  acceptanceScope: 'online',
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
  it('projects only allowlisted physical-place fields', () => {
    const snapshot = projectCandidateSourceSnapshot('physical_place', {
      rawRecord: { privateExtra: 'must not escape' },
      normalizedRecord: physicalRecord,
      unexpected: 'must not escape',
    });

    expect(snapshot).toMatchObject({
      kind: 'physical_place',
      name: 'Example Cafe',
      countryCode: 'JP',
      paymentTags: { 'payment:bitcoin': 'yes' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('privateExtra');
    expect(JSON.stringify(snapshot)).not.toContain('unexpected');
    expect(JSON.stringify(snapshot)).not.toContain('legacyId');
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
