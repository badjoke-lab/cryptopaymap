import {
  createAggregatedAuditHistoryBackend,
  type AuditHistorySource,
} from '../src/admin/audit-history/aggregation';
import type {
  AuditHistoryItem,
  AuditHistoryReadContext,
} from '../src/admin/audit-history/contract';
import { AuditHistoryError, loadAuditHistory } from '../src/admin/audit-history/history';

const candidateId = '10000000-0000-4000-8000-000000000001';
const claimId = '20000000-0000-4000-8000-000000000001';
const evidenceId = '30000000-0000-4000-8000-000000000001';
const mediaId = '40000000-0000-4000-8000-000000000001';
const snapshotDigest = 'a'.repeat(64);

const items = [
  {
    id: 'candidate:promotion:0001',
    occurredAt: '2026-07-05T05:00:00.000Z',
    domain: 'candidate',
    sourceKind: 'candidate_promotion',
    action: 'promote_candidate',
    actorId: 'cloudflare-access:reviewer',
    actorType: 'human',
    requestId: '50000000-0000-4000-8000-000000000001',
    target: { type: 'source_candidate', id: candidateId },
    secondaryTargets: [{ type: 'acceptance_claim', id: claimId }],
    reasonCode: 'verified_candidate',
    summary: 'Candidate promoted to a reviewed canonical target.',
    transition: { fromState: 'in_review', toState: 'resolved' },
    sourceRecordId: 'promotion-record-0001',
  },
  {
    id: 'evidence:decision:0001',
    occurredAt: '2026-07-05T04:00:00.000Z',
    domain: 'evidence',
    sourceKind: 'evidence_review_decision',
    action: 'approve_evidence',
    actorId: 'cloudflare-access:reviewer',
    actorType: 'human',
    requestId: '50000000-0000-4000-8000-000000000002',
    target: { type: 'evidence', id: evidenceId },
    secondaryTargets: [{ type: 'acceptance_claim', id: claimId }],
    reasonCode: 'official_source_verified',
    summary: 'Evidence approved for the reviewed Claim.',
    transition: { fromState: 'pending', toState: 'accepted' },
    sourceRecordId: 'evidence-decision-0001',
  },
  {
    id: 'reconfirmation:expiration:0001',
    occurredAt: '2026-07-05T03:00:00.000Z',
    domain: 'reconfirmation',
    sourceKind: 'reconfirmation_expiration',
    action: 'expire_confirmation',
    actorId: 'system:reconfirmation-scheduler',
    actorType: 'system',
    requestId: null,
    target: { type: 'acceptance_claim', id: claimId },
    secondaryTargets: [],
    reasonCode: 'review_window_elapsed',
    summary: 'The Claim moved to stale after its review window elapsed.',
    transition: { fromState: 'confirmed', toState: 'stale' },
    sourceRecordId: 'reconfirmation-event-0001',
  },
  {
    id: 'media:decision:0001',
    occurredAt: '2026-07-05T02:00:00.000Z',
    domain: 'media',
    sourceKind: 'media_review_decision',
    action: 'approve_public_media',
    actorId: 'cloudflare-access:media-reviewer',
    actorType: 'human',
    requestId: '50000000-0000-4000-8000-000000000003',
    target: { type: 'media_asset', id: mediaId },
    secondaryTargets: [],
    reasonCode: 'rights_and_privacy_cleared',
    summary: 'Reviewed media approved for public display.',
    transition: { fromState: 'pending', toState: 'accepted' },
    sourceRecordId: 'media-decision-0001',
  },
  {
    id: 'export:activation:0001',
    occurredAt: '2026-07-05T01:00:00.000Z',
    domain: 'export',
    sourceKind: 'export_activation',
    action: 'activate_release',
    actorId: 'system:export-publisher',
    actorType: 'system',
    requestId: '50000000-0000-4000-8000-000000000004',
    target: { type: 'export_snapshot', id: snapshotDigest },
    secondaryTargets: [],
    reasonCode: 'approved_release_activation',
    summary: 'The approved public export snapshot became active.',
    transition: null,
    sourceRecordId: 'export-activation-0001',
  },
] satisfies AuditHistoryItem[];

const cursorItem = items[1];
if (cursorItem === undefined) {
  throw new Error('Phase 3 integration fixture is missing the cursor item.');
}

const sources: AuditHistorySource[] = [
  'candidate',
  'evidence',
  'reconfirmation',
  'media',
  'export',
].map((domain) => ({
  domain,
  async loadAuditHistorySource(_query, sourceLimit) {
    return {
      items: items.filter((item) => item.domain === domain).slice(0, sourceLimit),
      hasMore: false,
    };
  },
})) as AuditHistorySource[];

const backend = createAggregatedAuditHistoryBackend(sources);
const context: AuditHistoryReadContext = {
  actorId: 'system:phase3-integration-audit',
  actorType: 'system',
  capabilities: ['audit:read'],
};
const asOf = new Date('2026-07-05T06:00:00.000Z');

const full = await loadAuditHistory(context, backend, { limit: 5 }, asOf);
if (
  full.items.map((item) => item.domain).join(',') !==
  'candidate,evidence,reconfirmation,media,export'
) {
  throw new Error('Phase 3 audit history is not deterministically ordered across domains.');
}

const bounded = await loadAuditHistory(context, backend, { limit: 3 }, asOf);
if (bounded.items.length !== 3 || bounded.hasMore !== true) {
  throw new Error('Phase 3 cross-domain history did not preserve bounded pagination.');
}

const exportOnly = await loadAuditHistory(context, backend, { domain: 'export', limit: 10 }, asOf);
if (exportOnly.items.length !== 1 || exportOnly.items[0]?.domain !== 'export') {
  throw new Error('Phase 3 audit domain filtering returned an invalid result.');
}

const claimHistory = await loadAuditHistory(
  context,
  backend,
  { targetType: 'acceptance_claim', targetId: claimId, limit: 10 },
  asOf,
);
if (
  claimHistory.items.map((item) => item.domain).join(',') !== 'candidate,evidence,reconfirmation'
) {
  throw new Error('Phase 3 target history did not preserve cross-domain Claim relationships.');
}

const cursorPage = await loadAuditHistory(
  context,
  backend,
  {
    before: cursorItem.occurredAt,
    beforeId: cursorItem.id,
    limit: 10,
  },
  asOf,
);
if (cursorPage.items.map((item) => item.domain).join(',') !== 'reconfirmation,media,export') {
  throw new Error('Phase 3 stable audit cursor produced an invalid continuation page.');
}

let unauthorizedRejected = false;
try {
  await loadAuditHistory(
    { ...context, capabilities: [] } as unknown as AuditHistoryReadContext,
    backend,
    { limit: 5 },
    asOf,
  );
} catch (error) {
  unauthorizedRejected = error instanceof AuditHistoryError && error.code === 'unauthorized';
}
if (!unauthorizedRejected) {
  throw new Error('Phase 3 audit history did not reject a context without audit:read.');
}

const leakingSource: AuditHistorySource = {
  domain: 'candidate',
  async loadAuditHistorySource() {
    return {
      items: [{ ...items[0], internalNote: 'private' } as unknown as AuditHistoryItem],
      hasMore: false,
    };
  },
};
let privatePayloadRejected = false;
try {
  await loadAuditHistory(
    context,
    createAggregatedAuditHistoryBackend([leakingSource]),
    { limit: 5 },
    asOf,
  );
} catch (error) {
  privatePayloadRejected = error instanceof AuditHistoryError && error.code === 'backend_failure';
}
if (!privatePayloadRejected) {
  throw new Error('Phase 3 audit history accepted a source item carrying private payload fields.');
}

console.log('Phase 3 cross-domain integration checks passed.');
