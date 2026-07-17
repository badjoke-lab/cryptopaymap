import { readFileSync } from 'node:fs';
import {
  businessClaimReviewTransitionActionValues,
  businessClaimReviewTransitionRequestSchema,
} from '../src/admin/submissions/business-claim-review-transitions';
import { photoParentResolutionPreviewResponseSchema } from '../src/admin/submissions/photo-parent-resolution-preview';
import { photoParentResolutionRequestSchema } from '../src/admin/submissions/photo-parent-resolution';
import {
  reviewEntryRequestSchema,
  reviewEntrySubmissionTypeValues,
} from '../src/admin/submissions/review-entry';
import {
  reviewFollowupRequestSchema,
  reviewFollowupSubmissionTypeValues,
} from '../src/admin/submissions/review-followup';
import {
  applySubmissionTerminalResolution,
  type SubmissionTerminalResolutionBackend,
  type SubmissionTerminalResolutionRequest,
} from '../src/admin/submissions/terminal-resolution';
import {
  suggestReviewTransitionActionValues,
  suggestReviewTransitionRequestSchema,
} from '../src/admin/submissions/transitions';
import {
  publicStatusLabelForSubmission,
  submissionPublicStatusProjectionSchema,
  type SubmissionResolution,
  type SubmissionType,
} from '../src/submissions/contract';

const expectedUpdatedAt = '2026-07-16T06:00:00.000Z';
const changedAt = new Date('2026-07-16T06:01:00.000Z');
const sourceSubmissionId = '10000000-0000-4000-8000-000000000001';
const duplicateSubmissionId = '20000000-0000-4000-8000-000000000001';
const handoffEventId = '30000000-0000-4000-8000-000000000001';
const firstMediaId = '40000000-0000-4000-8000-000000000001';
const secondMediaId = '40000000-0000-4000-8000-000000000002';
const firstDecisionId = '50000000-0000-4000-8000-000000000001';
const secondDecisionId = '50000000-0000-4000-8000-000000000002';

let requestSequence = 1;

function nextRequestId(): string {
  const suffix = String(requestSequence).padStart(12, '0');
  requestSequence += 1;
  return `60000000-0000-4000-8000-${suffix}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertParses(label: string, parse: () => unknown): void {
  try {
    parse();
  } catch (error) {
    throw new Error(`${label} did not satisfy its runtime schema.`, { cause: error });
  }
}

function assertExactValues(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  assert(
    actual.length === expected.length && actual.every((value, index) => value === expected[index]),
    `${label} changed: expected ${expected.join(', ')}, received ${actual.join(', ')}.`,
  );
}

assertExactValues('Suggest review-entry actions', suggestReviewTransitionActionValues, [
  'begin_triage',
  'begin_review',
]);
assertExactValues('Common review-entry types', reviewEntrySubmissionTypeValues, [
  'payment_report',
  'problem_report',
  'photos',
]);
assertExactValues('Common follow-up types', reviewFollowupSubmissionTypeValues, [
  'suggest',
  'payment_report',
  'problem_report',
  'photos',
]);
assertExactValues('Business Claim review actions', businessClaimReviewTransitionActionValues, [
  'begin_triage',
  'begin_review',
  'request_information',
  'place_on_hold',
  'resume_information_review',
  'resume_hold_review',
]);

for (const [action, expectedStatus] of [
  ['begin_triage', 'received'],
  ['begin_review', 'triage'],
] as const) {
  assertParses(`Suggest ${action}`, () =>
    suggestReviewTransitionRequestSchema.parse({
      schemaVersion: 'suggest-review-transition-v1',
      requestId: nextRequestId(),
      action,
      expectedStatus,
      expectedUpdatedAt,
    }),
  );
}

for (const submissionType of reviewEntrySubmissionTypeValues) {
  for (const [action, expectedStatus] of [
    ['begin_triage', 'received'],
    ['begin_review', 'triage'],
  ] as const) {
    assertParses(`${submissionType} ${action}`, () =>
      reviewEntryRequestSchema.parse({
        schemaVersion: 'submission-review-entry-v1',
        requestId: nextRequestId(),
        submissionType,
        action,
        expectedStatus,
        expectedUpdatedAt,
      }),
    );
  }
}

const claimReviewScenarios = [
  ['begin_triage', 'received', 'initial_review'],
  ['begin_review', 'triage', 'verification_prerequisites'],
  ['request_information', 'in_review', 'missing_information'],
  ['place_on_hold', 'in_review', 'authority_review'],
  ['resume_information_review', 'needs_information', 'information_received'],
  ['resume_hold_review', 'on_hold', 'hold_released'],
] as const;

for (const [action, expectedStatus, reasonCode] of claimReviewScenarios) {
  assertParses(`Business Claim ${action}`, () =>
    businessClaimReviewTransitionRequestSchema.parse({
      schemaVersion: 'business-claim-review-transition-v1',
      requestId: nextRequestId(),
      action,
      expectedStatus,
      expectedUpdatedAt,
      reasonCode,
    }),
  );
}

for (const submissionType of reviewFollowupSubmissionTypeValues) {
  assertParses(`${submissionType} information request`, () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: nextRequestId(),
      submissionType,
      action: 'request_information',
      expectedStatus: 'in_review',
      expectedUpdatedAt,
      requestedAction: 'Provide the missing review information.',
      publicMessage: 'Additional information is required before review can continue.',
    }),
  );
  assertParses(`${submissionType} information resume`, () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: nextRequestId(),
      submissionType,
      action: 'resume_after_information',
      expectedStatus: 'needs_information',
      expectedUpdatedAt,
    }),
  );
  assertParses(`${submissionType} Hold`, () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: nextRequestId(),
      submissionType,
      action: 'place_on_hold',
      expectedStatus: 'in_review',
      expectedUpdatedAt,
      holdDays: 30,
      holdReason: 'Awaiting a bounded external review dependency.',
      requiredAction: 'Complete the external verification step.',
      publicMessage: 'Review is temporarily on hold.',
    }),
  );
  assertParses(`${submissionType} Hold resume`, () =>
    reviewFollowupRequestSchema.parse({
      schemaVersion: 'submission-review-followup-v1',
      requestId: nextRequestId(),
      submissionType,
      action: 'resume_from_hold',
      expectedStatus: 'on_hold',
      expectedUpdatedAt,
    }),
  );
}

const terminalActions = ['not_approved', 'duplicate', 'no_change', 'withdrawn'] as const;
const submissionTypes: SubmissionType[] = [
  'suggest',
  'payment_report',
  'problem_report',
  'claim',
  'photos',
];
const allowedTerminalPairs = new Set([
  'suggest:not_approved',
  'suggest:duplicate',
  'suggest:no_change',
  'suggest:withdrawn',
  'payment_report:not_approved',
  'payment_report:withdrawn',
  'problem_report:not_approved',
  'problem_report:withdrawn',
  'claim:withdrawn',
  'photos:duplicate',
  'photos:no_change',
  'photos:withdrawn',
]);

function terminalRequest(
  submissionType: SubmissionType,
  action: (typeof terminalActions)[number],
): SubmissionTerminalResolutionRequest {
  const base = {
    schemaVersion: 'submission-terminal-resolution-v1' as const,
    requestId: nextRequestId(),
    submissionType,
    expectedUpdatedAt,
    publicMessage: 'The review is complete.',
    internalNote: null,
  };

  if (action === 'not_approved') {
    return {
      ...base,
      action,
      expectedStatus: 'in_review',
      reasonCode: 'insufficient_evidence',
      duplicateSubmissionId: null,
    };
  }
  if (action === 'duplicate') {
    return {
      ...base,
      action,
      expectedStatus: 'in_review',
      reasonCode: 'duplicate_submission',
      duplicateSubmissionId,
    };
  }
  if (action === 'no_change') {
    return {
      ...base,
      action,
      expectedStatus: 'in_review',
      reasonCode: 'already_current',
      duplicateSubmissionId: null,
    };
  }
  return {
    ...base,
    action,
    expectedStatus: 'received',
    reasonCode: 'submitter_requested',
    duplicateSubmissionId: null,
  };
}

for (const submissionType of submissionTypes) {
  for (const action of terminalActions) {
    const request = terminalRequest(submissionType, action);
    let backendReads = 0;
    const commits: unknown[] = [];
    const backend: SubmissionTerminalResolutionBackend = {
      async readEvent() {
        backendReads += 1;
        return null;
      },
      async readState() {
        backendReads += 1;
        return {
          submissionId: sourceSubmissionId,
          submissionType,
          workflowStatus: request.expectedStatus,
          resolution: null,
          updatedAt: expectedUpdatedAt,
        };
      },
      async readDuplicateTarget() {
        backendReads += 1;
        return {
          submissionId: duplicateSubmissionId,
          publicId: 'CPM-S-2026-000002',
          submissionType,
          workflowStatus: 'in_review',
        };
      },
      async commitResolution(command) {
        commits.push(command);
      },
    };
    const pair = `${submissionType}:${action}`;
    const allowed = allowedTerminalPairs.has(pair);

    try {
      const receipt = await applySubmissionTerminalResolution(
        {
          actorId: 'reviewer:p5-06f',
          actorType: 'human',
          capabilities: ['submission:terminal-resolution'],
        },
        backend,
        sourceSubmissionId,
        request,
        changedAt,
      );
      assert(allowed, `${pair} unexpectedly became eligible.`);
      assert(receipt.action === action, `${pair} returned the wrong terminal action.`);
      assert(commits.length === 1, `${pair} did not commit exactly once.`);
    } catch (error) {
      assert(!allowed, `${pair} unexpectedly failed.`);
      assert(
        typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ineligible',
        `${pair} failed for a reason other than type ownership.`,
      );
      assert(backendReads === 0, `${pair} touched protected state before the eligibility check.`);
      assert(commits.length === 0, `${pair} committed despite being type-ineligible.`);
    }
  }
}

const photoExpectedMedia = [
  {
    mediaAssetId: firstMediaId,
    expectedMediaUpdatedAt: '2026-07-16T05:58:00.000Z',
    decisionId: firstDecisionId,
    expectedDecisionAction: 'approve_public',
    expectedDecisionDecidedAt: '2026-07-16T05:58:00.000Z',
    expectedReviewStatus: 'accepted',
  },
  {
    mediaAssetId: secondMediaId,
    expectedMediaUpdatedAt: '2026-07-16T05:59:00.000Z',
    decisionId: secondDecisionId,
    expectedDecisionAction: 'reject',
    expectedDecisionDecidedAt: '2026-07-16T05:59:00.000Z',
    expectedReviewStatus: 'rejected',
  },
] as const;

const photoRequest = {
  schemaVersion: 'photo-parent-resolution-v1',
  requestId: nextRequestId(),
  expectedSubmissionStatus: 'in_review',
  expectedSubmissionUpdatedAt: expectedUpdatedAt,
  expectedHandoffEventId: handoffEventId,
  expectedMedia: photoExpectedMedia,
  publicMessage: 'One submitted photo was approved and one was not approved.',
  internalNote: null,
};

assertParses('Photos parent resolution request', () =>
  photoParentResolutionRequestSchema.parse(photoRequest),
);
assert(
  !photoParentResolutionRequestSchema.safeParse({
    ...photoRequest,
    resolution: 'approved',
  }).success,
  'Photos parent resolution accepted a client-selected aggregate outcome.',
);

assertParses('Photos parent partially-approved preview', () =>
  photoParentResolutionPreviewResponseSchema.parse({
    submissionId: sourceSubmissionId,
    workflowStatus: 'in_review',
    currentResolution: null,
    expectedSubmissionUpdatedAt: expectedUpdatedAt,
    handoffEventId,
    readiness: 'ready',
    derivedResolution: 'partially_approved',
    approvedCount: 1,
    rejectedCount: 1,
    pendingCount: 0,
    media: [
      {
        mediaReference: `MEDIA-${firstMediaId.toUpperCase()}`,
        mediaAssetId: firstMediaId,
        mediaUpdatedAt: '2026-07-16T05:58:00.000Z',
        reviewStatus: 'accepted',
        publicDecision: 'approved',
        decisionId: firstDecisionId,
        decisionAction: 'approve_public',
        decisionDecidedAt: '2026-07-16T05:58:00.000Z',
        expectedReviewStatus: 'accepted',
      },
      {
        mediaReference: `MEDIA-${secondMediaId.toUpperCase()}`,
        mediaAssetId: secondMediaId,
        mediaUpdatedAt: '2026-07-16T05:59:00.000Z',
        reviewStatus: 'rejected',
        publicDecision: 'rejected',
        decisionId: secondDecisionId,
        decisionAction: 'reject',
        decisionDecidedAt: '2026-07-16T05:59:00.000Z',
        expectedReviewStatus: 'rejected',
      },
    ],
    expectedRequest: {
      expectedSubmissionStatus: 'in_review',
      expectedSubmissionUpdatedAt: expectedUpdatedAt,
      expectedHandoffEventId: handoffEventId,
      expectedMedia: photoExpectedMedia,
    },
    generatedAt: changedAt.toISOString(),
  }),
);

const resolutionLabels: Array<[SubmissionResolution, string]> = [
  ['approved', 'approved'],
  ['partially_approved', 'partially_approved'],
  ['accepted_as_candidate', 'accepted_as_candidate'],
  ['not_approved', 'not_approved'],
  ['duplicate', 'closed'],
  ['no_change', 'closed'],
  ['withdrawn', 'closed'],
];

for (const [resolution, label] of resolutionLabels) {
  assert(
    publicStatusLabelForSubmission('resolved', resolution) === label,
    `Private status label mapping is incomplete for ${resolution}.`,
  );
}

const safePrivateStatus = {
  publicId: 'CPM-S-2026-000001',
  statusLabel: 'partially_approved',
  requestedAction: null,
  publicMessage: 'One submitted photo was approved and one was not approved.',
  nextReviewAt: null,
  linkedPublicRecord: null,
  mediaDecisions: [
    { mediaReference: `MEDIA-${firstMediaId.toUpperCase()}`, decision: 'approved' },
    { mediaReference: `MEDIA-${secondMediaId.toUpperCase()}`, decision: 'rejected' },
  ],
  permittedActions: [],
};

assertParses('private status partial outcome', () =>
  submissionPublicStatusProjectionSchema.parse(safePrivateStatus),
);
for (const forbiddenField of [
  'statusTokenHash',
  'encryptedEmail',
  'requestFingerprint',
  'storageKey',
  'objectUrl',
  'reviewerId',
  'privateProof',
]) {
  assert(
    !submissionPublicStatusProjectionSchema.safeParse({
      ...safePrivateStatus,
      [forbiddenField]: 'forbidden',
    }).success,
    `Private status projection accepted forbidden field ${forbiddenField}.`,
  );
}

const replayEvidence = [
  [
    'tests/suggest-review-transitions.test.ts',
    ['replays an identical request UUID', 'idempotency_conflict'],
  ],
  [
    'tests/submission-review-entry.test.ts',
    ['replays the exact request', 'recovers an exact concurrent commit as replay'],
  ],
  ['tests/submission-review-followup.test.ts', ['replayed', 'idempotency_conflict']],
  [
    'tests/business-claim-review-transitions.test.ts',
    ['replays an identical transition', 'idempotency_conflict'],
  ],
  ['tests/submission-terminal-resolution.test.ts', ['replayed', 'idempotency_conflict']],
  ['tests/photo-parent-resolution.test.ts', ['replayed', 'idempotency_conflict']],
] as const;

for (const [path, markers] of replayEvidence) {
  const source = readFileSync(path, 'utf8');
  for (const marker of markers) {
    assert(source.includes(marker), `${path} no longer proves ${marker}.`);
  }
}

const p506RuntimeFiles = [
  'src/admin/submissions/review-entry.ts',
  'src/admin/submissions/review-followup.ts',
  'src/admin/submissions/terminal-resolution.ts',
  'src/admin/submissions/photo-parent-resolution.ts',
  'src/admin/submissions/drizzle-review-entry-backend.ts',
  'src/admin/submissions/drizzle-review-followup-backend.ts',
  'src/admin/submissions/drizzle-terminal-resolution-backend.ts',
  'src/admin/submissions/drizzle-photo-parent-resolution-backend.ts',
];

const forbiddenCanonicalWrites = [
  '.insert(entities)',
  '.update(entities)',
  '.delete(entities)',
  '.insert(locations)',
  '.update(locations)',
  '.delete(locations)',
  '.insert(claims)',
  '.update(claims)',
  '.delete(claims)',
  '.insert(evidence',
  '.update(evidence',
  '.delete(evidence',
  '.insert(candidates)',
  '.update(candidates)',
  '.delete(candidates)',
  'activateExport',
  'publishRelease',
];

for (const path of p506RuntimeFiles) {
  const source = readFileSync(path, 'utf8');
  for (const forbidden of forbiddenCanonicalWrites) {
    assert(
      !source.includes(forbidden),
      `${path} contains forbidden P5-07/export effect ${forbidden}.`,
    );
  }
}

const privateStatusSource = readFileSync('src/submissions/private-status-service.ts', 'utf8');
for (const forbidden of [
  'statusTokenHash:',
  'encryptedEmail:',
  'requestFingerprint:',
  'storageKey:',
  'objectUrl:',
  'reviewerId:',
  'privateProof:',
]) {
  assert(
    !privateStatusSource.includes(forbidden),
    `Private status service explicitly projects forbidden field ${forbidden}.`,
  );
}

console.log('P5-06F cross-submission integration audit passed.');
