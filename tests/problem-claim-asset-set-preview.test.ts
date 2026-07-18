import { describe, expect, it } from 'vitest';
import type { SubmissionApplicationLifecycleRecord } from '../src/admin/submissions/application-lifecycle';
import {
  type ProblemClaimAssetSetPreviewBackend,
  type ProblemClaimAssetSetPreviewState,
  readProblemClaimAssetSetPreview,
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
const registeredAt = '2026-07-18T13:00:00.000Z';
const claimUpdatedAt = '2026-07-18T12:00:00.000Z';
const generatedAt = new Date('2026-07-18T14:00:00.000Z');

const context = {
  actorId: 'reviewer:claim-asset-preview',
  actorType: 'human' as const,
  capabilities: ['submission:problem-claim-asset-preview:read'] as [
    'submission:problem-claim-asset-preview:read',
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
        observedAt: '2026-07-15',
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
        notes: 'Preserve this bounded note internally.',
      },
    ],
  };
}

function backend(initial = state()): ProblemClaimAssetSetPreviewBackend {
  return {
    async readApplicationState(id) {
      return id === applicationId ? structuredClone(initial) : null;
    },
    async readAssetBySlug(slug) {
      if (slug === 'usdc') {
        return { id: proposedAssetId, slug: 'usdc', symbol: 'USDC', status: 'active' };
      }
      if (slug === 'btc') return { id: assetId, slug: 'btc', symbol: 'BTC', status: 'active' };
      return null;
    },
    async readNetworkBySlug(slug) {
      return slug === 'bitcoin' ? { id: networkId, slug: 'bitcoin', status: 'active' } : null;
    },
  };
}

describe('P5-07D5 Claim Asset replacement preview', () => {
  it('builds a deterministic complete replacement set for an exact single-row asset correction', async () => {
    const preview = await readProblemClaimAssetSetPreview(
      context,
      backend(),
      applicationId,
      generatedAt,
    );

    expect(preview).toMatchObject({
      readiness: 'ready',
      selectedCurrentRowId: rowId,
      correction: { reportType: 'wrong_asset', kind: 'asset', proposedSlug: 'usdc' },
      target: { claimId, claimStatus: 'confirmed', routeType: 'direct_wallet' },
    });
    expect(preview.currentSet).toHaveLength(1);
    expect(preview.proposedSet).toHaveLength(1);
    expect(preview.proposedSet?.[0]).toMatchObject({
      asset: { id: proposedAssetId, slug: 'usdc', symbol: 'USDC', status: 'active' },
      network: { id: networkId, slug: 'bitcoin' },
      paymentMethod: { id: methodId, slug: 'onchain' },
      contractAddress: null,
      isPrimary: true,
      notesPresent: true,
    });
    expect(preview.proposedSet?.[0]?.rowId).not.toBe(rowId);
    expect(preview.currentSetHash).not.toBe(preview.proposedSetHash);
    expect(JSON.stringify(preview)).not.toContain('Preserve this bounded note internally.');
  });

  it('stops a multiple-row Claim for separately reviewed row selection', async () => {
    const multiple = state();
    multiple.rows.push({
      ...structuredClone(multiple.rows[0]),
      rowId: '80000000-0000-4000-8000-000000000002',
      isPrimary: false,
      asset: { id: proposedAssetId, slug: 'eth', symbol: 'ETH', status: 'active' },
      network: {
        id: '60000000-0000-4000-8000-000000000002',
        slug: 'ethereum',
        status: 'active',
      },
    });
    const preview = await readProblemClaimAssetSetPreview(
      context,
      backend(multiple),
      applicationId,
      generatedAt,
    );
    expect(preview.readiness).toBe('needs_selection');
    expect(preview.proposedSet).toBeNull();
    expect(preview.selectedCurrentRowId).toBeNull();
    expect(preview.issues).toContain(
      'Multiple Claim Asset rows require a separately reviewed row-selection plan.',
    );
  });

  it('reports no canonical change when the proposed registry value already matches', async () => {
    const matching = state();
    const correction = { kind: 'asset' as const, assetSlug: 'btc' };
    (matching.submission.normalizedPayload as { proposedCorrection: unknown }).proposedCorrection =
      correction;
    if (matching.sourceDecisionEvent !== null) {
      matching.sourceDecisionEvent.internalNote = serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'b'.repeat(64),
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
      });
    }
    const preview = await readProblemClaimAssetSetPreview(
      context,
      backend(matching),
      applicationId,
      generatedAt,
    );
    expect(preview.readiness).toBe('already_matches');
    expect(preview.proposedSet).toBeNull();
  });

  it('rejects an instruction correction instead of widening the Claim Asset owner', async () => {
    const invalid = state();
    const correction = { kind: 'instructions' as const, howToPay: 'Use the new QR.' };
    (invalid.submission.normalizedPayload as { reportType: string }).reportType =
      'wrong_instructions';
    (invalid.submission.normalizedPayload as { proposedCorrection: unknown }).proposedCorrection =
      correction;
    if (invalid.sourceDecisionEvent !== null) {
      invalid.sourceDecisionEvent.internalNote = serializeProblemReportDecisionEvent({
        schemaVersion: 'problem-report-decision-event-v1',
        requestFingerprint: 'c'.repeat(64),
        operation: 'approve_correction_handoff',
        reportType: 'wrong_instructions',
        claimId: null,
        evidenceId: null,
        verificationEventId: null,
        claimAction: null,
        proposedCorrection: correction,
        duplicateTarget: null,
        publicSummary: null,
        internalNote: null,
      });
    }
    await expect(
      readProblemClaimAssetSetPreview(context, backend(invalid), applicationId, generatedAt),
    ).rejects.toMatchObject({ code: 'ineligible' });
  });
});
