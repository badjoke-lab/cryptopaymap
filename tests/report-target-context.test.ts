import { describe, expect, it } from 'vitest';
import type {
  PaymentReportReviewProjection,
  ProblemReportReviewProjection,
} from '../src/submissions/report-contract';
import {
  generateReportTargetContext,
  type ReportCanonicalTargetMaterial,
  ReportTargetContextError,
} from '../src/submissions/report-target-context';

const entityId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000002';
const claimId = '30000000-0000-4000-8000-000000000003';
const otherClaimId = '40000000-0000-4000-8000-000000000004';
const generatedAt = new Date('2026-07-13T03:00:00.000Z');

function claim(
  id = claimId,
  overrides: Partial<ReportCanonicalTargetMaterial['claims'][number]> = {},
): ReportCanonicalTargetMaterial['claims'][number] {
  return {
    id,
    entityId,
    locationId,
    claimScope: 'location_specific',
    routeType: 'processor_checkout',
    acceptanceScope: 'all_checkout',
    claimStatus: 'confirmed',
    visibility: 'public',
    processorName: 'Example Pay',
    howToPay: 'Choose crypto at checkout.',
    restrictions: null,
    firstConfirmedAt: '2026-01-01T00:00:00.000Z',
    lastConfirmedAt: '2026-07-01T00:00:00.000Z',
    nextReviewAt: '2026-10-01T00:00:00.000Z',
    endedAt: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    options: [
      {
        assetSlug: 'usdc',
        networkSlug: 'base',
        paymentMethod: 'processor_checkout',
        isPrimary: true,
      },
    ],
    ...overrides,
  };
}

function locationMaterial(
  overrides: Partial<ReportCanonicalTargetMaterial> = {},
): ReportCanonicalTargetMaterial {
  return {
    targetType: 'location',
    targetId: locationId,
    entity: {
      id: entityId,
      entityType: 'merchant',
      name: 'Example Cafe',
      slug: null,
      websiteUrl: 'https://cafe.example/',
      countryCode: 'JP',
      entityStatus: 'active',
      visibility: 'public',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    location: {
      id: locationId,
      entityId,
      name: 'Example Cafe Shibuya',
      slug: 'example-cafe-shibuya',
      addressLine: '1-2-3 Jingumae',
      locality: 'Shibuya',
      region: 'Tokyo',
      postalCode: '150-0001',
      countryCode: 'JP',
      latitude: 35.67,
      longitude: 139.7,
      locationStatus: 'active',
      visibility: 'public',
      websiteUrl: 'https://cafe.example/shibuya',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    claims: [claim()],
    selectedClaimId: null,
    ...overrides,
  };
}

function paymentReport(
  targetType: PaymentReportReviewProjection['targetType'] = 'location',
  targetId = locationId,
): PaymentReportReviewProjection {
  return {
    reportKind: 'payment_report',
    targetType,
    targetId,
    result: 'successful',
    paymentDate: '2026-07-12',
    payment: {
      assetSlug: 'usdc',
      networkSlug: 'base',
      routeType: 'processor_checkout',
      paymentMethod: 'processor_checkout',
      processor: { name: 'Example Pay', websiteUrl: null },
      context: 'hosted_checkout',
      observedSteps: 'Selected USDC and completed checkout.',
    },
    notes: null,
    evidenceLinks: [],
    restrictedEvidence: { privateTransactionUrlPresent: false },
  };
}

function problemReport(
  targetType: ProblemReportReviewProjection['targetType'] = 'location',
  targetId = locationId,
): ProblemReportReviewProjection {
  return {
    reportKind: 'problem_report',
    targetType,
    targetId,
    reportType: 'wrong_network',
    observedAt: '2026-07-12',
    explanation: 'The listed network is incorrect.',
    proposedCorrection: { kind: 'network', networkSlug: 'base' },
    duplicateTarget: null,
    evidenceLinks: [],
    restrictedEvidence: { privateEvidenceUrlPresent: false },
  };
}

function backend(material: ReportCanonicalTargetMaterial | null) {
  return {
    async loadTarget() {
      return material;
    },
  };
}

describe('P5-03C report target context', () => {
  it('resolves a public Location and emits bounded payment Claim matches', async () => {
    const result = await generateReportTargetContext(
      paymentReport(),
      backend(locationMaterial()),
      generatedAt,
    );

    expect(result).toMatchObject({
      generatedAt: generatedAt.toISOString(),
      target: {
        targetType: 'location',
        targetId: locationId,
        canonicalPath: '/place/example-cafe-shibuya',
        selectedClaimId: null,
      },
      reportability: { publiclyReachable: true, reasons: [] },
      coverage: {
        targetLookupComplete: true,
        claimContextComplete: true,
        absenceIsConclusive: false,
      },
    });
    expect(result.claimSignals).toEqual([
      {
        claimId,
        claimStatus: 'confirmed',
        visibility: 'public',
        reasons: [
          'target_level_claim_context',
          'same_route_type',
          'same_asset',
          'same_network',
          'same_payment_method',
          'same_processor_name',
        ],
      },
    ]);
  });

  it('resolves a selected Claim target without recommending a state change', async () => {
    const material: ReportCanonicalTargetMaterial = {
      ...locationMaterial(),
      targetType: 'claim',
      targetId: claimId,
      selectedClaimId: claimId,
    };
    const result = await generateReportTargetContext(
      problemReport('claim', claimId),
      backend(material),
      generatedAt,
    );

    expect(result.target).toMatchObject({
      targetType: 'claim',
      targetId: claimId,
      canonicalPath: '/place/example-cafe-shibuya',
      selectedClaimId: claimId,
    });
    expect(result.claimSignals[0]).toMatchObject({
      claimId,
      claimStatus: 'confirmed',
      reasons: ['selected_target_claim', 'problem_may_affect_payment_claim'],
    });
    expect(JSON.stringify(result)).not.toContain('recommendedStatus');
    expect(JSON.stringify(result)).not.toContain('priority');
  });

  it('derives the public Online Service path for an Entity target', async () => {
    const material: ReportCanonicalTargetMaterial = {
      targetType: 'entity',
      targetId: entityId,
      entity: {
        id: entityId,
        entityType: 'online_service',
        name: 'Example Hosting',
        slug: 'example-hosting',
        websiteUrl: 'https://hosting.example/',
        countryCode: 'US',
        entityStatus: 'active',
        visibility: 'public',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
      location: null,
      claims: [
        claim(claimId, {
          locationId: null,
          claimScope: 'online_service',
        }),
      ],
      selectedClaimId: null,
    };

    const result = await generateReportTargetContext(
      paymentReport('entity', entityId),
      backend(material),
      generatedAt,
    );

    expect(result.target.canonicalPath).toBe('/service/example-hosting');
    expect(result.reportability.publiclyReachable).toBe(true);
  });

  it('reports bounded reasons when a target is not publicly reachable', async () => {
    const material = locationMaterial({
      entity: {
        ...locationMaterial().entity,
        visibility: 'hidden',
        entityStatus: 'ended',
      },
      location: {
        ...locationMaterial().location!,
        visibility: 'temporarily_hidden',
        locationStatus: 'closed',
      },
    });

    const result = await generateReportTargetContext(
      paymentReport(),
      backend(material),
      generatedAt,
    );

    expect(result.reportability).toEqual({
      publiclyReachable: false,
      reasons: [
        'entity_not_public',
        'entity_not_active',
        'location_not_public',
        'location_not_active',
      ],
    });
  });

  it('reports selected hidden or candidate Claim boundaries without exposing private detail', async () => {
    const selected = claim(claimId, { visibility: 'hidden', claimStatus: 'candidate' });
    const material: ReportCanonicalTargetMaterial = {
      ...locationMaterial({ claims: [selected] }),
      targetType: 'claim',
      targetId: claimId,
      selectedClaimId: claimId,
    };

    const result = await generateReportTargetContext(
      problemReport('claim', claimId),
      backend(material),
      generatedAt,
    );

    expect(result.reportability).toEqual({
      publiclyReachable: false,
      reasons: ['claim_not_public', 'claim_not_reportable_status'],
    });
    expect(JSON.stringify(result)).not.toContain('howToPay');
    expect(JSON.stringify(result)).not.toContain('restrictions');
  });

  it('keeps absence of matching Claim signals non-conclusive', async () => {
    const material = locationMaterial({
      claims: [
        claim(otherClaimId, {
          routeType: 'direct_wallet',
          processorName: null,
          options: [
            {
              assetSlug: 'btc',
              networkSlug: 'bitcoin',
              paymentMethod: 'wallet_qr',
              isPrimary: true,
            },
          ],
        }),
      ],
    });

    const result = await generateReportTargetContext(
      paymentReport(),
      backend(material),
      generatedAt,
    );

    expect(result.claimSignals).toEqual([
      {
        claimId: otherClaimId,
        claimStatus: 'confirmed',
        visibility: 'public',
        reasons: ['target_level_claim_context'],
      },
    ]);
    expect(result.coverage.absenceIsConclusive).toBe(false);
  });

  it('does not treat non-payment problem types as Claim-state signals', async () => {
    const report = { ...problemReport(), reportType: 'privacy_issue' as const };
    const result = await generateReportTargetContext(
      report,
      backend(locationMaterial()),
      generatedAt,
    );

    expect(result.claimSignals).toEqual([
      {
        claimId,
        claimStatus: 'confirmed',
        visibility: 'public',
        reasons: ['target_level_claim_context'],
      },
    ]);
  });

  it('fails with a bounded not-found error', async () => {
    await expect(
      generateReportTargetContext(paymentReport(), backend(null), generatedAt),
    ).rejects.toMatchObject({ code: 'target_not_found' });
  });

  it('fails closed when backend target identity or ownership is inconsistent', async () => {
    const wrongTarget = locationMaterial({ targetId: entityId });
    await expect(
      generateReportTargetContext(paymentReport(), backend(wrongTarget), generatedAt),
    ).rejects.toBeInstanceOf(ReportTargetContextError);

    const ambiguousEntity: ReportCanonicalTargetMaterial = {
      ...locationMaterial(),
      targetType: 'entity',
      targetId: entityId,
      selectedClaimId: null,
    };
    await expect(
      generateReportTargetContext(
        paymentReport('entity', entityId),
        backend(ambiguousEntity),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    const brandClaimWithLocation: ReportCanonicalTargetMaterial = {
      ...locationMaterial({
        claims: [
          claim(claimId, {
            locationId: null,
            claimScope: 'brand_global',
          }),
        ],
      }),
      targetType: 'claim',
      targetId: claimId,
      selectedClaimId: claimId,
    };
    await expect(
      generateReportTargetContext(
        problemReport('claim', claimId),
        backend(brandClaimWithLocation),
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'invalid_response' });

    const wrongOwner = locationMaterial({
      claims: [claim(claimId, { entityId: otherClaimId })],
    });
    await expect(
      generateReportTargetContext(paymentReport(), backend(wrongOwner), generatedAt),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('maps backend exceptions and invalid times to bounded errors', async () => {
    await expect(
      generateReportTargetContext(
        paymentReport(),
        {
          async loadTarget() {
            throw new Error('database detail must not escape');
          },
        },
        generatedAt,
      ),
    ).rejects.toMatchObject({ code: 'backend_failure' });

    await expect(
      generateReportTargetContext(
        paymentReport(),
        backend(locationMaterial()),
        new Date(Number.NaN),
      ),
    ).rejects.toMatchObject({ code: 'invalid_projection' });
  });
});
