import { describe, expect, it } from 'vitest';
import {
  businessClaimSubmissionIntakeSchema,
  normalizeBusinessClaimSubmissionIntake,
} from '../src/submissions/business-claim-contract';

const targetId = '10000000-0000-4000-8000-000000000001';

function entityClaim(): any {
  return {
    schemaVersion: 'submission-common-v1',
    submissionType: 'claim',
    targetType: 'entity',
    targetId,
    relationship: 'owner_or_authorized_representative',
    contact: null,
    evidenceLinks: [],
    originalPayload: {
      schemaVersion: 'business-claim-v1',
      claimantRole: 'owner',
      requestedScopes: ['representative_relationship', 'entity_profile', 'payment_information'],
      verification: {
        method: 'official_domain_email',
        officialDomain: 'merchant.example',
        officialContactEmail: 'owner@merchant.example',
        officialWebsiteUrl: 'https://merchant.example',
        officialSocialUrl: null,
        assistedVerifierReference: null,
        privateProofUrl: 'https://evidence.example/private-owner-proof',
      },
      proposedChanges: {
        entity: {
          name: 'Merchant Example',
          legalName: null,
          websiteUrl: 'https://merchant.example',
          countryCode: 'JP',
        },
        location: null,
        paymentProposals: [
          {
            assetSlug: 'bitcoin',
            networkSlug: 'lightning',
            routeType: 'direct_wallet',
            paymentMethod: 'lightning_invoice',
            processor: null,
            contractAddress: null,
            howToPay: 'Ask staff to display a Lightning invoice.',
            restrictions: null,
            isPrimary: true,
          },
        ],
      },
      authorityStatement: 'I own this business and am authorized to verify its public profile.',
    },
    acknowledgements: {
      privacyNoticeAccepted: true,
      submissionTermsAccepted: true,
    },
  };
}

describe('P5-04A business claim contract', () => {
  it('normalizes an entity claim without exposing contact or proof values', () => {
    const input = entityClaim();
    const projection = normalizeBusinessClaimSubmissionIntake(input);

    expect(projection).toMatchObject({
      targetType: 'entity',
      targetId,
      claimantRole: 'owner',
      requestedScopes: ['representative_relationship', 'entity_profile', 'payment_information'],
      verification: {
        method: 'official_domain_email',
        officialDomain: 'merchant.example',
        officialContactEmailPresent: true,
        officialWebsiteUrl: 'https://merchant.example',
        officialSocialUrl: null,
        assistedVerifierReferencePresent: false,
        privateProofPresent: true,
      },
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('owner@merchant.example');
    expect(serialized).not.toContain('private-owner-proof');
  });

  it('requires official email to belong to the declared domain', () => {
    const input = structuredClone(entityClaim());
    input.originalPayload.verification.officialContactEmail = 'owner@unrelated.example';
    expect(() => businessClaimSubmissionIntakeSchema.parse(input)).toThrow();
  });

  it('requires method-specific verification material', () => {
    const website = structuredClone(entityClaim());
    website.originalPayload.verification.method = 'website_code';
    website.originalPayload.verification.officialWebsiteUrl = null;
    expect(() => businessClaimSubmissionIntakeSchema.parse(website)).toThrow();

    const dns = structuredClone(entityClaim());
    dns.originalPayload.verification.method = 'dns_txt';
    dns.originalPayload.verification.officialDomain = null;
    expect(() => businessClaimSubmissionIntakeSchema.parse(dns)).toThrow();

    const social = structuredClone(entityClaim());
    social.originalPayload.verification.method = 'official_social';
    social.originalPayload.verification.officialSocialUrl = null;
    expect(() => businessClaimSubmissionIntakeSchema.parse(social)).toThrow();
  });

  it('rejects location changes on an entity-targeted claim', () => {
    const input = structuredClone(entityClaim());
    input.originalPayload.requestedScopes.push('location_profile');
    input.originalPayload.proposedChanges.location = {
      name: 'Branch',
      addressLine: '1 Example Street',
      locality: 'Tokyo',
      region: null,
      postalCode: null,
      countryCode: 'JP',
      latitude: null,
      longitude: null,
      websiteUrl: null,
      phone: null,
      description: null,
      openingHours: null,
      amenities: [],
      socialLinks: [],
    };
    expect(() => businessClaimSubmissionIntakeSchema.parse(input)).toThrow();
  });

  it('accepts a location claim with profile scope but rejects entity profile changes', () => {
    const input = structuredClone(entityClaim());
    input.targetType = 'location';
    input.originalPayload.requestedScopes = ['representative_relationship', 'location_profile'];
    input.originalPayload.proposedChanges.entity = null;
    input.originalPayload.proposedChanges.paymentProposals = null;
    input.originalPayload.proposedChanges.location = {
      name: null,
      addressLine: '2 Corrected Street',
      locality: 'Tokyo',
      region: null,
      postalCode: null,
      countryCode: 'JP',
      latitude: null,
      longitude: null,
      websiteUrl: null,
      phone: null,
      description: null,
      openingHours: null,
      amenities: [],
      socialLinks: [],
    };
    expect(businessClaimSubmissionIntakeSchema.parse(input).targetType).toBe('location');

    input.originalPayload.requestedScopes.push('entity_profile');
    input.originalPayload.proposedChanges.entity = {
      name: 'Wrongly scoped entity change',
      legalName: null,
      websiteUrl: null,
      countryCode: null,
    };
    expect(() => businessClaimSubmissionIntakeSchema.parse(input)).toThrow();
  });

  it('does not grant a relationship through a different common relationship value', () => {
    const input = structuredClone(entityClaim());
    input.relationship = 'employee';
    expect(() => businessClaimSubmissionIntakeSchema.parse(input)).toThrow();
  });
});
