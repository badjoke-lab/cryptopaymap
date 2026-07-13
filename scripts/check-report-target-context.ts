import type { PaymentReportReviewProjection } from '../src/submissions/report-contract';
import {
  generateReportTargetContext,
  type ReportCanonicalTargetMaterial,
} from '../src/submissions/report-target-context';

const entityId = '10000000-0000-4000-8000-000000000001';
const locationId = '20000000-0000-4000-8000-000000000002';
const claimId = '30000000-0000-4000-8000-000000000003';

const report: PaymentReportReviewProjection = {
  reportKind: 'payment_report',
  targetType: 'location',
  targetId: locationId,
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

const material: ReportCanonicalTargetMaterial = {
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
  claims: [
    {
      id: claimId,
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
      nextReviewAt: null,
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
    },
  ],
  selectedClaimId: null,
};

const result = await generateReportTargetContext(
  report,
  {
    async loadTarget() {
      return material;
    },
  },
  new Date('2026-07-13T03:00:00.000Z'),
);

if (
  result.target.canonicalPath !== '/place/example-cafe-shibuya' ||
  !result.reportability.publiclyReachable ||
  result.claimSignals[0]?.claimId !== claimId ||
  !result.claimSignals[0]?.reasons.includes('same_network') ||
  result.coverage.absenceIsConclusive !== false ||
  JSON.stringify(result).includes('howToPay') ||
  JSON.stringify(result).includes('restrictions')
) {
  throw new Error('Report target context check produced an invalid result.');
}

console.log('Payment and problem report target context checks passed.');
