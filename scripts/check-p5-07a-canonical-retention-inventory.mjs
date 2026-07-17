import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireMarkers(path, markers) {
  const source = read(path);
  for (const marker of markers) {
    assert(
      source.includes(marker),
      `${path} no longer contains required inventory marker ${JSON.stringify(marker)}.`,
    );
  }
  return source;
}

function rejectMarkers(path, markers) {
  const source = read(path);
  for (const marker of markers) {
    assert(
      !source.includes(marker),
      `${path} unexpectedly contains excluded inventory marker ${JSON.stringify(marker)}.`,
    );
  }
  return source;
}

const candidatePromotion = requireMarkers(
  'src/admin/promotion/drizzle-candidate-promotion-backend.ts',
  [
    'database.insert(entities)',
    'database.insert(locations)',
    'database.insert(acceptanceClaims)',
    'database.insert(claimAssets)',
    'database.insert(provenanceLinks)',
    "candidateStatus: 'promoted'",
    "claimStatus: 'candidate'",
    "visibility: 'hidden'",
    'requestFingerprint',
  ],
);
assert(
  candidatePromotion.includes('expectedCandidateUpdatedAt') &&
    candidatePromotion.includes('sourceRecordIds'),
  'Candidate promotion no longer proves exact Candidate and source-set guards.',
);

requireMarkers('src/admin/promotion/drizzle-existing-target-link-backend.ts', [
  'database.insert(acceptanceClaims)',
  'database.insert(claimAssets)',
  'database.insert(provenanceLinks)',
  "candidateStatus: 'promoted'",
  "claimStatus: 'candidate'",
  "visibility: 'hidden'",
]);
rejectMarkers('src/admin/promotion/drizzle-existing-target-link-backend.ts', [
  'database.insert(entities)',
  'database.insert(locations)',
]);

requireMarkers('src/admin/submissions/drizzle-payment-report-evidence-backend.ts', [
  'database.insert(evidence)',
  "workflowStatus: 'resolved'",
  "resolution: 'approved'",
  '.update(acceptanceClaims)',
  "claimStatus: 'confirmed'",
  'database.insert(verificationEvents)',
  'database.insert(verificationEventEvidence)',
]);

requireMarkers('src/admin/submissions/drizzle-negative-report-evidence-backend.ts', [
  'database.insert(evidence)',
  "polarity: 'contradicting'",
  "workflowStatus: 'resolved'",
  "resolution: 'approved'",
  "action: 'negative_report_evidence_decided'",
]);
rejectMarkers('src/admin/submissions/drizzle-negative-report-evidence-backend.ts', [
  '.update(acceptanceClaims)',
  'database.insert(verificationEvents)',
  'database.insert(verificationEventEvidence)',
]);

requireMarkers('src/admin/submissions/problem-report-decision.ts', [
  "operation: z.enum(['approve_correction_handoff', 'resolve_duplicate', 'resolve_no_change'])",
  "operation: z.literal('temporarily_hide_claim')",
  "operation: z.literal('apply_negative_claim_action')",
]);
requireMarkers('src/admin/submissions/drizzle-problem-report-decision-backend.ts', [
  '.update(acceptanceClaims)',
  'database.insert(verificationEvents)',
  "claimStatus: 'stale'",
  "claimStatus: 'ended'",
  "toVisibility: 'temporarily_hidden'",
]);
rejectMarkers('src/admin/submissions/drizzle-problem-report-decision-backend.ts', [
  '.update(entities)',
  '.update(locations)',
  'database.insert(provenanceLinks)',
]);

requireMarkers('src/admin/submissions/business-claim-field-application.ts', [
  'expectedSubmissionUpdatedAt',
  'expectedRelationshipDecisionId',
  'expectedEntityUpdatedAt',
  'expectedLocationUpdatedAt',
  'acceptedProposals',
  'hasAcceptedChanges',
]);
requireMarkers('src/admin/submissions/drizzle-business-claim-field-application-backend.ts', [
  'and $' + "{submissions.workflowStatus} = 'resolved'",
  'and $' + "{submissions.resolution} = 'approved'",
  '.update(entities)',
  '.update(locations)',
  "action: 'business_claim_fields_applied'",
]);
rejectMarkers('src/admin/submissions/drizzle-business-claim-field-application-backend.ts', [
  'database.insert(claimAssets)',
  'database.insert(provenanceLinks)',
]);

requireMarkers('src/admin/media-review/drizzle-write.ts', [
  'readMediaReviewDecision',
  'requestFingerprint',
  'buildMediaReviewBatch',
  'replayMediaReviewDecision',
]);
requireMarkers('src/admin/media-review/drizzle-batch.ts', [
  '.update(mediaAssets)',
  'database.insert(mediaReviewDecisions)',
  'buildMediaFileTransitionStatements',
]);
rejectMarkers('src/admin/media-review/drizzle-batch.ts', [
  'exportRelease',
  'publication',
  'activateRelease',
]);

const submissionSchema = requireMarkers('src/db/schema/submissions.ts', [
  'export const submissionPayloads = pgTable(',
  'export const submissionContacts = pgTable(',
  "retentionUntil: timestamp('retention_until'",
  "index('submission_contacts_retention_idx')",
]);
const payloadStart = submissionSchema.indexOf('export const submissionPayloads = pgTable(');
const contactStart = submissionSchema.indexOf('export const submissionContacts = pgTable(');
assert(
  payloadStart >= 0 && contactStart > payloadStart,
  'Submission payload/contact schema boundaries are missing.',
);
const payloadSchema = submissionSchema.slice(payloadStart, contactStart);
assert(
  !payloadSchema.includes('retentionUntil') && !payloadSchema.includes('deletedAt'),
  'Submission payloads unexpectedly gained a retention or deletion field without updating P5-07A.',
);
assert(
  !submissionSchema.includes('submissionApplicationDecisions') &&
    !submissionSchema.includes('submission_application_decisions'),
  'A common Submission application receipt now exists and the P5-07A inventory must be revised.',
);

requireMarkers('src/submissions/photo-private-lifecycle.ts', [
  'PHOTO_TERMINAL_RETENTION_DAYS = 30',
  "'expired_authorization'",
  "'closed_submission_without_handoff'",
  "'rejected_media'",
  "'superseded_media'",
  'deletePrivateObject',
]);
rejectMarkers('src/submissions/photo-private-lifecycle.ts', ['scheduled(', 'cron(', 'onScheduled']);

const workflowPolicy = requireMarkers('docs/SUBMISSION_WORKFLOW.md', [
  '## 17. Canonical transaction',
  'If any required operation fails, the transaction rolls back.',
  '### 17.1 Publication run',
  '## 20. Privacy and retention',
  'contact data;',
  'private evidence;',
  'media originals;',
]);
assert(
  workflowPolicy.indexOf('## 17. Canonical transaction') <
    workflowPolicy.indexOf('### 17.1 Publication run'),
  'Canonical transaction and publication order changed.',
);

const applicationSources = [
  'src/admin/promotion/drizzle-candidate-promotion-backend.ts',
  'src/admin/promotion/drizzle-existing-target-link-backend.ts',
  'src/admin/submissions/drizzle-payment-report-evidence-backend.ts',
  'src/admin/submissions/drizzle-negative-report-evidence-backend.ts',
  'src/admin/submissions/drizzle-problem-report-decision-backend.ts',
  'src/admin/submissions/drizzle-business-claim-field-application-backend.ts',
  'src/admin/media-review/drizzle-batch.ts',
];
for (const path of applicationSources) {
  const source = read(path);
  for (const forbidden of [
    'activateExport',
    'publishRelease',
    'exportReleaseActivation',
    'publicReleaseActivated',
  ]) {
    assert(
      !source.includes(forbidden),
      `${path} now mixes canonical application with ${forbidden}.`,
    );
  }
}

console.log('P5-07A canonical application and retention inventory passed.');
