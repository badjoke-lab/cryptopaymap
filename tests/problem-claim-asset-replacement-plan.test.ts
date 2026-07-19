import { describe, expect, it } from 'vitest';
import type { SubmissionApplicationLifecycleRecord } from '../src/admin/submissions/application-lifecycle';
import {
  prepareProblemClaimAssetReplacementPlan,
  type ProblemClaimAssetReplacementPlanBackend,
  type ProblemClaimAssetReplacementPlanEventRecord,
} from '../src/admin/submissions/problem-claim-asset-replacement-plan';
import {
  readProblemClaimAssetSetPreview,
  type ProblemClaimAssetSetPreviewState,
} from '../src/admin/submissions/problem-claim-asset-set-preview';
import { serializeProblemReportDecisionEvent } from '../src/submissions/problem-report-decision-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const decisionEventId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const assetId = '50000000-0000-4000-8000-000000000001';
const proposedAssetId = '50000000-0000-4000-8000-000000000002';
const networkId = '60000000-0000-4000-8000-000000000001';
const methodId = '70000000-0000-4000-8000-000000000001';
const rowId = '80000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-19T09:00:00.000Z';
const claimUpdatedAt = '2026-07-19T08:00:00.000Z';
const plannedAt = new Date('2026-07-19T10:00:00.000Z');

const context = {
  actorId: 'reviewer:claim-asset-plan',
  actorType: 'human' as const,
  capabilities: ['submission:problem-claim-asset-plan:prepare'] as [
    'submission:problem-claim-asset-plan:prepare',
  ],
};

function application(): SubmissionApplicationLifecycleRecord {
  return {
    applicationId,
    submissionId,
    submissionType: 'problem_report',
    sourceDecisionKind: 'problem_correction_handoff',
    sourceDecisionEventId: decisionEventId,
    applicationKind: 'problem_correction',
    applicationStatus: 'pending',
    publicationStatus: 'blocked',
    applicationReceipt: null,
    publicationReceipt: null,
    registeredAt,
    updatedAt: registeredAt,
    events: [],
  };
}

function state(): ProblemClaimAssetSetPreviewState {
  const correction = { kind: 'asset' as const, assetSlug: 'usdc' };
  return {
    application: application(),
    submission: {
      submissionId,
      submissionType: 'problem_report',
      targetType: 'claim',
      targetId: claimId,
      workflowStatus: 'resolved',
      resolution: 'approved',
      normalizedPayload: {
        reportKind: 'problem_report',
        targetType: 'claim',
        targetId: claimId,
        reportType: 'wrong_asset',
        observedAt: '2026-07-18',
        explanation: 'The listed asset is wrong.',
        proposedCorrection: correction,
        duplicateTarget: null,
        evidenceLinks: [],
        restrictedEvidence: { privateEvidenceUrlPresent: false },
      },
    },
    sourceDecisionEvent: {
      eventId: decisionEventId,
      submissionId,
      toStatus: 'resolved',
      action: 'problem_correction_handoff_approved',
      internalNote: serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'a'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_asset',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: correction,
        duplicateTarget: null,
        publicSummary: null,
        internalNote: null,
      }),
    },
    claim: {
      claimId,
      claimStatus: 'confirmed',
      routeType: 'direct_wallet',
      updatedAt: claimUpdatedAt,
      deletedAt: null,
    },
    rows: [
      {
        rowId,
        claimId,
        asset: { id: assetId, slug: 'btc', symbol: 'BTC', status: 'active' },
        network: { id: networkId, slug: 'bitcoin', status: 'active' },
        paymentMethod: { id: methodId, slug: 'onchain', status: 'active' },
        contractAddress: null,
        isPrimary: true,
        notes: 'Private bounded Claim Asset note.',
      },
    ],
  };
}

function backend(initial = state()) {
  let current = structuredClone(initial);
  const events = new Map<string, ProblemClaimAssetReplacementPlanEventRecord>();
  const implementation: ProblemClaimAssetReplacementPlanBackend = {
    async readApplicationState(id) {
      return id === applicationId ? structuredClone(current) : null;
    },
    async readAssetBySlug(slug) {
      if (slug === 'usdc') {
        return { id: proposedAssetId, slug: 'usdc', symbol: 'USDC', status: 'active' };
      }
      return slug === 'btc'
        ? { id: assetId, slug: 'btc', symbol: 'BTC', status: 'active' }
        : null;
    },
    async readNetworkBySlug(slug) {
      return slug === 'bitcoin' ? { id: networkId, slug: 'bitcoin', status: 'active' } : null;
    },
    async readPlanEvent(planId) {
      return events.get(planId) ?? null;
    },
    async commitPlan(command) {
      events.set(command.planId, {
        eventId: command.planId,
        submissionId: command.submissionId,
        fromStatus: null,
        toStatus: 'resolved',
        action: 'problem_claim_asset_replacement_planned',
        reasonCode: command.correctionKind,
        actorId: command.actorId,
        actorType: command.actorType === 'human' ? 'reviewer' : 'system',
        internalNote: command.internalNote,
        createdAt: command.plannedAt.toISOString(),
      });
    },
  };
  return {
    implementation,
    replaceState(next: ProblemClaimAssetSetPreviewState) {
      current = structuredClone(next);
    },
    events,
  };
}

async function currentSetHash(backend: ProblemClaimAssetReplacementPlanBackend): Promise<string> {
  const preview = await readProblemClaimAssetSetPreview(
    {
      actorId: 'reviewer:preview',
      actorType: 'human',
      capabilities: ['submission:problem-claim-asset-preview:read'],
    },
    backend,
    applicationId,
    plannedAt,
  );
  return preview.currentSetHash;
}

function request(hash: string, requestId = '90000000-0000-4000-8000-000000000001') {
  return {
    schemaVersion: 'problem-claim-asset-replacement-plan-v1',
    requestId,
    expectedApplicationUpdatedAt: registeredAt,
    expectedClaimUpdatedAt: claimUpdatedAt,
    expectedSourceDecisionEventId: decisionEventId,
    expectedCurrentSetHash: hash,
    selection: {
      mode: 'automatic_single_row' as const,
      selectedCurrentRowId: null,
    },
  };
}

describe('P5-07D6 durable Claim Asset replacement planning', () => {
  it('commits and exactly replays a private complete-set plan without canonical mutation', async () => {
    const store = backend();
    const hash = await currentSetHash(store.implementation);
    const before = await store.implementation.readApplicationState(applicationId);
    const first = await prepareProblemClaimAssetReplacementPlan(
      context,
      store.implementation,
      applicationId,
      request(hash),
      plannedAt,
    );
    expect(first).toMatchObject({
      state: 'committed',
      applicationId,
      claimId,
      selectedCurrentRowId: rowId,
      correction: { kind: 'asset', proposedSlug: 'usdc' },
    });
    expect(first.currentSetHash).toBe(hash);
    expect(first.proposedSetHash).not.toBe(hash);
    expect(await store.implementation.readApplicationState(applicationId)).toEqual(before);

    const event = store.events.get(first.planId);
    expect(event?.internalNote).toContain('Private bounded Claim Asset note.');
    const replay = await prepareProblemClaimAssetReplacementPlan(
      context,
      store.implementation,
      applicationId,
      request(hash),
      plannedAt,
    );
    expect(replay).toEqual({ ...first, state: 'replayed' });
    expect(store.events).toHaveLength(1);
  });

  it('requires one explicitly reviewed current row for a multi-row Claim', async () => {
    const multiple = state();
    const first = multiple.rows[0];
    if (first === undefined) throw new Error('Expected one Claim Asset fixture row.');
    const secondRowId = '80000000-0000-4000-8000-000000000002';
    multiple.rows.push({
      ...structuredClone(first),
      rowId: secondRowId,
      isPrimary: false,
      asset: { id: proposedAssetId, slug: 'eth', symbol: 'ETH', status: 'active' },
      network: {
        id: '60000000-0000-4000-8000-000000000002',
        slug: 'ethereum',
        status: 'active',
      },
    });
    const store = backend(multiple);
    const hash = await currentSetHash(store.implementation);
    await expect(
      prepareProblemClaimAssetReplacementPlan(
        context,
        store.implementation,
        applicationId,
        request(hash),
        plannedAt,
      ),
    ).rejects.toMatchObject({ code: 'selection_required' });

    const reviewed = {
      ...request(hash, '90000000-0000-4000-8000-000000000002'),
      selection: {
        mode: 'reviewed_current_row' as const,
        selectedCurrentRowId: rowId,
      },
    };
    const receipt = await prepareProblemClaimAssetReplacementPlan(
      context,
      store.implementation,
      applicationId,
      reviewed,
      plannedAt,
    );
    expect(receipt.state).toBe('committed');
    expect(receipt.selectedCurrentRowId).toBe(rowId);
    expect(receipt.replacementRowId).not.toBe(rowId);
  });

  it('rejects stale set hashes and arbitrary selected rows', async () => {
    const store = backend();
    await expect(
      prepareProblemClaimAssetReplacementPlan(
        context,
        store.implementation,
        applicationId,
        request('f'.repeat(64)),
        plannedAt,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});
