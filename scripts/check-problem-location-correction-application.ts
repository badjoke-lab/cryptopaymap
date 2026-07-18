import {
  problemLocationCorrectionApplicationReceiptSchema,
  problemLocationCorrectionApplicationRequestSchema,
  problemLocationCorrectionSourcePayloadSchema,
} from '../src/admin/submissions/problem-location-correction-application';
import {
  authorizeProblemLocationCorrectionApplication,
  readProblemLocationCorrectionApplicationAuthorizationPolicy,
} from '../src/admin/submissions/problem-location-correction-application-authorization';
import { submissionApplicationReceiptKindSchema } from '../src/admin/submissions/application-registration';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const locationId = '30000000-0000-4000-8000-000000000001';
const sourceDecisionEventId = '40000000-0000-4000-8000-000000000001';
const sourceRecordId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const timestamp = '2026-07-18T08:00:00.000Z';

problemLocationCorrectionApplicationRequestSchema.parse({
  schemaVersion: 'problem-location-correction-application-v1',
  requestId,
  expectedApplicationUpdatedAt: timestamp,
  expectedLocationUpdatedAt: timestamp,
});

problemLocationCorrectionApplicationReceiptSchema.parse({
  state: 'committed',
  applicationId,
  submissionId,
  locationId,
  correctionDecisionRequestId: requestId,
  sourceRecordId,
  appliedFieldPaths: ['addressLine'],
  applicationStatus: 'committed',
  publicationStatus: 'pending',
  transitionEventId: requestId,
  appliedAt: timestamp,
});

problemLocationCorrectionSourcePayloadSchema.parse({
  schemaVersion: 'problem-location-correction-source-v1',
  submissionReference: 'CPM-S-2026-000321',
  sourceDecisionEventId,
  targetLocationId: locationId,
  reportType: 'wrong_address',
  observedAt: '2026-07-10',
  proposedCorrection: { kind: 'location_profile', addressLine: '2 New Street' },
});

if (
  problemLocationCorrectionApplicationRequestSchema.safeParse({
    schemaVersion: 'problem-location-correction-application-v1',
    requestId,
    expectedApplicationUpdatedAt: timestamp,
    expectedLocationUpdatedAt: timestamp,
    locationId,
    changes: { addressLine: 'client-selected' },
    sourceRecordId,
    applicationStatus: 'committed',
  }).success
) {
  throw new Error('Problem Location correction application accepted client-selected derived state.');
}

if (
  problemLocationCorrectionSourcePayloadSchema.safeParse({
    schemaVersion: 'problem-location-correction-source-v1',
    submissionReference: 'CPM-S-2026-000321',
    sourceDecisionEventId,
    targetLocationId: locationId,
    reportType: 'wrong_address',
    observedAt: '2026-07-10',
    proposedCorrection: { kind: 'location_profile', addressLine: '2 New Street' },
    internalNote: 'private reviewer material',
    privateEvidenceUrl: 'https://example.test/private',
  }).success
) {
  throw new Error('Problem Location correction source payload accepted private reviewer material.');
}

if (!submissionApplicationReceiptKindSchema.safeParse('location_profile_correction_decision').success) {
  throw new Error('Location profile correction receipt kind is unavailable.');
}

const policy = readProblemLocationCorrectionApplicationAuthorizationPolicy({
  CPM_ADMIN_PROBLEM_LOCATION_CORRECTION_SUBJECTS: JSON.stringify([
    'problem-location-correction-operator',
  ]),
});
const context = authorizeProblemLocationCorrectionApplication(
  {
    actorId: 'cloudflare-access:problem-location-correction-operator',
    actorType: 'human',
    subject: 'problem-location-correction-operator',
    email: 'operator@example.com',
  },
  policy,
);
if (!context.capabilities.includes('submission:problem-location-correction:apply')) {
  throw new Error('Problem Location correction authorization did not grant the exact capability.');
}

console.log('Problem Location correction application checks passed.');
