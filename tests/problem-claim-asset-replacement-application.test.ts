import { describe, expect, it } from 'vitest';
import type {
  SubmissionApplicationLifecycleRecord,
  SubmissionApplicationTransitionCommand,
  SubmissionApplicationTransitionReplayRecord,
} from '../src/admin/submissions/application-lifecycle';
import {
  applyProblemClaimAssetReplacementApplication,
  type ProblemClaimAssetReplacementApplicationBackend,
  type ProblemClaimAssetReplacementApplicationEventRecord,
  type ProblemClaimAssetReplacementApplicationState,
  type ProblemClaimAssetReplacementCommitCommand,
} from '../src/admin/submissions/problem-claim-asset-replacement-application';
import {
  prepareProblemClaimAssetReplacementPlan,
  type ProblemClaimAssetReplacementPlanBackend,
  type ProblemClaimAssetReplacementPlanCommitCommand,
  type ProblemClaimAssetReplacementPlanEventRecord,
} from '../src/admin/submissions/problem-claim-asset-replacement-plan';
import {
  readProblemClaimAssetSetPreview,
  type ProblemClaimAssetSetPreviewState,
} from '../src/admin/submissions/problem-claim-asset-set-preview';
import { problemClaimAssetReplacementApplicationEventPayloadSchema } from '../src/submissions/problem-claim-asset-replacement-application-contract';
import { serializeProblemClaimAssetReplacementPlanEventPayload } from '../src/submissions/problem-claim-asset-replacement-plan-contract';
import { serializeProblemReportDecisionEvent } from '../src/submissions/problem-report-decision-contract';

const applicationId = '10000000-0000-4000-8000-000000000001';
const submissionId = '20000000-0000-4000-8000-000000000001';
const decisionEventId = '30000000-0000-4000-8000-000000000001';
const claimId = '40000000-0000-4000-8000-000000000001';
const sourceId = '50000000-0000-4000-8000-000000000001';
const assetId = '60000000-0000-4000-8000-000000000001';
const proposedAssetId = '60000000-0000-4000-8000-000000000002';
const networkId = '70000000-0000-4000-8000-000000000001';
const methodId = '80000000-0000-4000-8000-000000000001';
const rowId = '90000000-0000-4000-8000-000000000001';
const planId = 'a0000000-0000-4000-8000-000000000001';
const requestId = 'b0000000-0000-4000-8000-000000000001';
const registeredAt = '2026-07-19T09:00:00.000Z';
const claimUpdatedAt = '2026-07-19T08:00:00.000Z';
const plannedAt = new Date('2026-07-19T10:00:00.000Z');
const appliedAt = new Date('2026-07-19T11:00:00.000Z');

const planContext = {
  actorId: 'reviewer:claim-asset-plan',
  actorType: 'human' as const,
  capabilities: ['submission:problem-claim-asset-plan:prepare'] as [
    'submission:problem-claim-asset-plan:prepare',
  ],
};
const applyContext = {
  actorId: 'reviewer:claim-asset-apply',
  actorType: 'human' as const,
  capabilities: ['submission:problem-claim-assets:apply'] as [
    'submission:problem-claim-assets:apply',
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

function previewState(): ProblemClaimAssetSetPreviewState {
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
        requestFingerprint: 'c'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_asset',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: correction,
        duplicateTarget: null,
        publicSummary: 'Corrected the accepted payment asset.',
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

class Store
  implements ProblemClaimAssetReplacementPlanBackend, ProblemClaimAssetReplacementApplicationBackend
{
  private preview = structuredClone(previewState());
  private applicationRecord = structuredClone(this.preview.application);
  private readonly planEvents = new Map<string, ProblemClaimAssetReplacementPlanEventRecord>();
  private readonly correctionEvents = new Map<
    string,
    ProblemClaimAssetReplacementApplicationEventRecord
  >();
  private readonly transitions = new Map<string, SubmissionApplicationTransitionReplayRecord>();
  canonicalCommits = 0;

  async readApplicationState(id: string): Promise<ProblemClaimAssetSetPreviewState | null>;
  async readApplicationState(
    id: string,
    requestedPlanId: string,
    correctionEventId: string,
  ): Promise<ProblemClaimAssetReplacementApplicationState | null>;
  async readApplicationState(
    id: string,
    requestedPlanId?: string,
    correctionEventId?: string,
  ): Promise<ProblemClaimAssetSetPreviewState | ProblemClaimAssetReplacementApplicationState | null> {
    if (id !== applicationId) return null;
    this.preview.application = structuredClone(this.applicationRecord);
    if (requestedPlanId === undefined || correctionEventId === undefined) {
      return structuredClone(this.preview);
    }
    return {
      application: structuredClone(this.applicationRecord),
      submission: {
        ...structuredClone(this.preview.submission),
        publicId: 'CPM-S-2026-000001',
      },
      sourceDecisionEvent:
        this.preview.sourceDecisionEvent === null
          ? null
          : { ...structuredClone(this.preview.sourceDecisionEvent), createdAt: registeredAt },
      planEvent: structuredClone(this.planEvents.get(requestedPlanId) ?? null),
      correctionEvent: structuredClone(this.correctionEvents.get(correctionEventId) ?? null),
      claim: structuredClone(this.preview.claim),
      rows: structuredClone(this.preview.rows),
    };
  }

  async readAssetBySlug(slug: string) {
    if (slug === 'usdc') {
      return { id: proposedAssetId, slug: 'usdc', symbol: 'USDC', status: 'active' as const };
    }
    return slug === 'btc'
      ? { id: assetId, slug: 'btc', symbol: 'BTC', status: 'active' as const }
      : null;
  }

  async readNetworkBySlug(slug: string) {
    return slug === 'bitcoin'
      ? { id: networkId, slug: 'bitcoin', status: 'active' as const }
      : null;
  }

  async readPlanEvent(id: string) {
    return structuredClone(this.planEvents.get(id) ?? null);
  }

  async commitPlan(command: ProblemClaimAssetReplacementPlanCommitCommand) {
    const payload = JSON.parse(command.internalNote) as { plannedAt: string };
    this.planEvents.set(command.planId, {
      eventId: command.planId,
      submissionId: command.submissionId,
      fromStatus: null,
      toStatus: 'resolved',
      action: 'problem_claim_asset_replacement_planned',
      reasonCode: command.correctionKind,
      actorId: command.actorId,
      actorType: 'reviewer',
      internalNote: command.internalNote,
      createdAt: payload.plannedAt,
    });
  }

  async readApplication(id: string) {
    return id === applicationId ? structuredClone(this.applicationRecord) : null;
  }

  async readTransition(id: string) {
    return structuredClone(this.transitions.get(id) ?? null);
  }

  async commitTransition(command: SubmissionApplicationTransitionCommand) {
    this.applicationRecord.applicationStatus = command.toApplicationStatus;
    this.applicationRecord.publicationStatus = command.toPublicationStatus;
    this.applicationRecord.applicationReceipt = command.nextApplicationReceipt;
    this.applicationRecord.publicationReceipt = command.nextPublicationReceipt;
    this.applicationRecord.updatedAt = command.changedAt.toISOString();
    this.transitions.set(command.transitionEventId, {
      transitionEventId: command.transitionEventId,
      applicationId: command.applicationId,
      action: command.action,
      fromApplicationStatus: command.fromApplicationStatus,
      toApplicationStatus: command.toApplicationStatus,
      fromPublicationStatus: command.fromPublicationStatus,
      toPublicationStatus: command.toPublicationStatus,
      actorId: command.actorId,
      requestFingerprint: command.requestFingerprint,
      changedAt: command.changedAt.toISOString(),
    });
  }

  async commitClaimAssetReplacement(command: ProblemClaimAssetReplacementCommitCommand) {
    this.canonicalCommits += 1;
    this.preview.rows = structuredClone(command.proposedSet);
    if (this.preview.claim === null) throw new Error('Expected a Claim fixture.');
    this.preview.claim.updatedAt = command.appliedAt.toISOString();
    const eventPayload = problemClaimAssetReplacementApplicationEventPayloadSchema.parse({
      schemaVersion: 'problem-claim-asset-replacement-application-event-v1',
      requestFingerprint: command.requestFingerprint,
      applicationId: command.applicationId,
      planId: command.planId,
      sourceDecisionEventId: command.sourceDecisionEventId,
      claimId: command.claimId,
      sourceRecordId: command.sourceRecord.id,
      verificationEventId: command.verificationEventId,
      expectedApplicationUpdatedAt: command.expectedApplicationUpdatedAt.toISOString(),
      expectedPlanCreatedAt: command.planCreatedAt.toISOString(),
      expectedClaimUpdatedAt: command.expectedClaimUpdatedAt.toISOString(),
      currentSetHash: command.currentSetHash,
      proposedSetHash: command.proposedSetHash,
      selectedCurrentRowId: command.selectedCurrentRowId,
      replacementRowId: command.replacementRowId,
      correctionKind: command.correctionKind,
    });
    this.correctionEvents.set(command.requestId, {
      eventId: command.requestId,
      submissionId: command.submissionId,
      fromStatus: null,
      toStatus: 'resolved',
      action: 'problem_claim_assets_replaced',
      reasonCode: `problem_report_${command.correctionKind}_correction`,
      actorId: command.actorId,
      actorType: 'reviewer',
      internalNote: JSON.stringify(eventPayload),
      createdAt: command.appliedAt.toISOString(),
    });
    return {
      state: 'committed' as const,
      correctionEventId: command.requestId,
      planId: command.planId,
      claimId: command.claimId,
      sourceRecordId: command.sourceRecord.id,
      verificationEventId: command.verificationEventId,
      currentSetHash: command.currentSetHash,
      proposedSetHash: command.proposedSetHash,
      appliedAt: command.appliedAt.toISOString(),
    };
  }

  corruptPlan() {
    const event = this.planEvents.get(planId);
    if (event === undefined || event.internalNote === null) throw new Error('Expected a plan event.');
    const payload = JSON.parse(event.internalNote) as {
      proposedSet: Array<{ notes: string | null }>;
    };
    const first = payload.proposedSet[0];
    if (first === undefined) throw new Error('Expected a proposed row.');
    first.notes = 'Arbitrary changed note.';
    event.internalNote = serializeProblemClaimAssetReplacementPlanEventPayload(
      payload as Parameters<typeof serializeProblemClaimAssetReplacementPlanEventPayload>[0],
    );
  }
}

async function preparePlan(store: Store) {
  const preview = await readProblemClaimAssetSetPreview(
    {
      actorId: 'reviewer:preview',
      actorType: 'human',
      capabilities: ['submission:problem-claim-asset-preview:read'],
    },
    store,
    applicationId,
    plannedAt,
  );
  return prepareProblemClaimAssetReplacementPlan(
    planContext,
    store,
    applicationId,
    {
      schemaVersion: 'problem-claim-asset-replacement-plan-v1',
      requestId: planId,
      expectedApplicationUpdatedAt: registeredAt,
      expectedClaimUpdatedAt: claimUpdatedAt,
      expectedSourceDecisionEventId: decisionEventId,
      expectedCurrentSetHash: preview.currentSetHash,
      selection: { mode: 'automatic_single_row', selectedCurrentRowId: null },
    },
    plannedAt,
  );
}

function request(plan: Awaited<ReturnType<typeof preparePlan>>) {
  return {
    schemaVersion: 'problem-claim-asset-replacement-application-v1',
    requestId,
    planId: plan.planId,
    expectedApplicationUpdatedAt: registeredAt,
    expectedPlanCreatedAt: plan.plannedAt,
    expectedClaimUpdatedAt: claimUpdatedAt,
    expectedSourceDecisionEventId: decisionEventId,
    expectedCurrentSetHash: plan.currentSetHash,
    expectedProposedSetHash: plan.proposedSetHash,
  };
}

describe('P5-07D7 Claim Asset complete-set replacement application', () => {
  it('applies one durable plan, records the lifecycle receipt, and exactly replays', async () => {
    const store = new Store();
    const plan = await preparePlan(store);
    const first = await applyProblemClaimAssetReplacementApplication(
      applyContext,
      store,
      applicationId,
      sourceId,
      request(plan),
      appliedAt,
    );
    expect(first).toMatchObject({
      state: 'committed',
      applicationId,
      submissionId,
      claimId,
      planId,
      applicationStatus: 'committed',
      publicationStatus: 'pending',
    });
    expect(first.currentSetHash).not.toBe(first.proposedSetHash);
    expect(store.canonicalCommits).toBe(1);

    const replay = await applyProblemClaimAssetReplacementApplication(
      applyContext,
      store,
      applicationId,
      sourceId,
      request(plan),
      appliedAt,
    );
    expect(replay.state).toBe('already_applied');
    expect(replay.correctionEventId).toBe(first.correctionEventId);
    expect(store.canonicalCommits).toBe(1);
    expect(JSON.stringify(replay)).not.toContain('Private bounded Claim Asset note.');
  });

  it('rejects a stale complete-set expectation', async () => {
    const store = new Store();
    const plan = await preparePlan(store);
    await expect(
      applyProblemClaimAssetReplacementApplication(
        applyContext,
        store,
        applicationId,
        sourceId,
        { ...request(plan), expectedCurrentSetHash: 'f'.repeat(64) },
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });

  it('rejects a durable plan that changes preserved row metadata', async () => {
    const store = new Store();
    const plan = await preparePlan(store);
    store.corruptPlan();
    await expect(
      applyProblemClaimAssetReplacementApplication(
        applyContext,
        store,
        applicationId,
        sourceId,
        request(plan),
        appliedAt,
      ),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });
});
