import {
  projectClaimState,
  verificationDecisionInputSchema,
  verificationEventInputSchema,
} from '../src/schemas/verification-events';

const claimId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';

const confirmedEvent = {
  claimId,
  eventType: 'confirmed',
  fromStatus: 'candidate',
  toStatus: 'confirmed',
  fromVisibility: null,
  toVisibility: null,
  reasonCode: 'evidence_threshold_met',
  effectiveAt: '2026-06-01T00:00:00Z',
  publicSummary: 'Cryptocurrency acceptance was confirmed.',
  internalNote: null,
  actorType: 'system',
  actorId: null,
};

const confirmedDecision = {
  event: confirmedEvent,
  evidenceLinks: [{ evidenceId, relationship: 'basis' }],
};

if (!verificationDecisionInputSchema.safeParse(confirmedDecision).success) {
  throw new Error('Valid confirmation decision was rejected.');
}

const invalidEvents = [
  { ...confirmedEvent, fromStatus: 'stale' },
  { ...confirmedEvent, eventType: 'reconfirmed', fromStatus: 'candidate' },
  { ...confirmedEvent, toVisibility: 'public' },
  {
    ...confirmedEvent,
    eventType: 'marked_stale',
    fromStatus: 'stale',
    toStatus: 'stale',
  },
  {
    ...confirmedEvent,
    eventType: 'hidden',
    fromVisibility: 'public',
    toVisibility: 'hidden',
  },
  {
    ...confirmedEvent,
    eventType: 'hidden',
    fromStatus: null,
    toStatus: null,
    fromVisibility: 'hidden',
    toVisibility: 'hidden',
  },
  { ...confirmedEvent, actorType: 'operator', actorId: null },
  {
    ...confirmedEvent,
    eventType: 'corrected',
    fromStatus: null,
    toStatus: null,
    publicSummary: null,
    internalNote: null,
  },
  {
    ...confirmedEvent,
    eventType: 'corrected',
    internalNote: 'Corrected a metadata field.',
  },
];

if (invalidEvents.some((event) => verificationEventInputSchema.safeParse(event).success)) {
  throw new Error('Invalid verification event was accepted.');
}

const invalidDecisions = [
  { ...confirmedDecision, evidenceLinks: [] },
  {
    ...confirmedDecision,
    evidenceLinks: [
      { evidenceId, relationship: 'basis' },
      { evidenceId, relationship: 'context' },
    ],
  },
];

if (invalidDecisions.some((decision) => verificationDecisionInputSchema.safeParse(decision).success)) {
  throw new Error('Invalid verification decision was accepted.');
}

const history = [
  confirmedEvent,
  {
    ...confirmedEvent,
    eventType: 'unhidden',
    fromStatus: null,
    toStatus: null,
    fromVisibility: 'hidden',
    toVisibility: 'public',
    reasonCode: 'publication_approved',
    effectiveAt: '2026-06-01T01:00:00Z',
  },
  {
    ...confirmedEvent,
    eventType: 'marked_stale',
    fromStatus: 'confirmed',
    toStatus: 'stale',
    reasonCode: 'review_overdue',
    effectiveAt: '2026-12-01T00:00:00Z',
  },
  {
    ...confirmedEvent,
    eventType: 'restored',
    fromStatus: 'stale',
    toStatus: 'confirmed',
    reasonCode: 'acceptance_reconfirmed',
    effectiveAt: '2026-12-03T00:00:00Z',
  },
];

const projection = projectClaimState({ status: 'candidate', visibility: 'hidden' }, history);
if (projection.status !== 'confirmed' || projection.visibility !== 'public') {
  throw new Error('Verification event replay produced an incorrect claim projection.');
}

let mismatchRejected = false;
try {
  projectClaimState(
    { status: 'candidate', visibility: 'hidden' },
    [
      {
        ...confirmedEvent,
        eventType: 'marked_stale',
        fromStatus: 'confirmed',
        toStatus: 'stale',
      },
    ],
  );
} catch {
  mismatchRejected = true;
}
if (!mismatchRejected) {
  throw new Error('Verification event replay accepted a mismatched history.');
}

console.log('Verification event checks passed.');
