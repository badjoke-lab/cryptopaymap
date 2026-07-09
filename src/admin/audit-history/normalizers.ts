import type { CandidateDuplicateDecision } from '../../db/schema/candidate-duplicates';
import type { CandidatePromotionDecision } from '../../db/schema/candidate-promotions';
import type { EvidenceReviewDecision } from '../../db/schema/evidence-review-decisions';
import type { ExportActivationRecord } from '../../db/schema/export-activation-records';
import type { ExportReleaseDecision } from '../../db/schema/export-release-decisions';
import type { LocationProfileCorrectionDecision } from '../../db/schema/location-profile-correction-decisions';
import type { MediaReviewDecision } from '../../db/schema/media-review-decisions';
import type { ReconfirmationExpiration } from '../../db/schema/reconfirmation-expirations';
import type {
  SubmissionEvent,
  submissionTypeValues,
} from '../../db/schema/submissions';
import type { ExportRestoreExecutionRecord } from '../export-release/restore-execution';
import type { AuditHistoryItem, AuditHistoryTarget } from './contract';

function itemId(sourceKind: AuditHistoryItem['sourceKind'], sourceRecordId: string): string {
  return `${sourceKind}:${sourceRecordId}`;
}

function subjectTarget(
  subjectType: MediaReviewDecision['expectedSubjectType'],
  subjectId: string,
): AuditHistoryTarget | null {
  if (subjectType === 'claim') return { type: 'acceptance_claim', id: subjectId };
  if (subjectType === 'evidence') return { type: 'evidence', id: subjectId };
  return null;
}

export interface SubmissionEventAuditRow {
  id: SubmissionEvent['id'];
  publicId: string;
  submissionType: (typeof submissionTypeValues)[number];
  fromStatus: SubmissionEvent['fromStatus'];
  toStatus: SubmissionEvent['toStatus'];
  action: SubmissionEvent['action'];
  reasonCode: SubmissionEvent['reasonCode'];
  actorId: SubmissionEvent['actorId'];
  actorType: SubmissionEvent['actorType'];
  createdAt: SubmissionEvent['createdAt'];
}

export function candidateDuplicateDecisionAuditItem(
  row: CandidateDuplicateDecision,
): AuditHistoryItem {
  return {
    id: itemId('candidate_duplicate_decision', row.id),
    occurredAt: row.decidedAt.toISOString(),
    domain: 'candidate',
    sourceKind: 'candidate_duplicate_decision',
    action: row.action,
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'duplicate_group', id: row.duplicateGroupId },
    secondaryTargets: row.memberCandidateIds.map((id) => ({ type: 'source_candidate', id })),
    reasonCode: row.reasonCode,
    summary: null,
    transition: null,
    sourceRecordId: row.id,
  };
}

export function candidatePromotionAuditItem(row: CandidatePromotionDecision): AuditHistoryItem {
  return {
    id: itemId('candidate_promotion', row.id),
    occurredAt: row.promotedAt.toISOString(),
    domain: 'candidate',
    sourceKind: 'candidate_promotion',
    action: 'promote_candidate',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'source_candidate', id: row.candidateId },
    secondaryTargets: [{ type: 'acceptance_claim', id: row.claimId }],
    reasonCode: null,
    summary: null,
    transition: null,
    sourceRecordId: row.id,
  };
}

export function locationProfileCorrectionAuditItem(
  row: LocationProfileCorrectionDecision,
): AuditHistoryItem {
  return {
    id: itemId('location_profile_correction', row.id),
    occurredAt: row.decidedAt.toISOString(),
    domain: 'canonical',
    sourceKind: 'location_profile_correction',
    action: 'correct_location_profile',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'location', id: row.locationId },
    secondaryTargets: [],
    reasonCode: row.reasonCode,
    summary: row.publicSummary,
    transition: null,
    sourceRecordId: row.id,
  };
}

export function evidenceReviewDecisionAuditItem(row: EvidenceReviewDecision): AuditHistoryItem {
  return {
    id: itemId('evidence_review_decision', row.id),
    occurredAt: row.decidedAt.toISOString(),
    domain: 'evidence',
    sourceKind: 'evidence_review_decision',
    action: row.claimAction === 'no_change' ? 'review_evidence' : row.claimAction,
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'evidence', id: row.evidenceId },
    secondaryTargets: [{ type: 'acceptance_claim', id: row.claimId }],
    reasonCode: row.reasonCode,
    summary: row.publicSummary,
    transition: { fromState: row.fromClaimStatus, toState: row.toClaimStatus },
    sourceRecordId: row.id,
  };
}

export function reconfirmationExpirationAuditItem(row: ReconfirmationExpiration): AuditHistoryItem {
  return {
    id: itemId('reconfirmation_expiration', row.id),
    occurredAt: row.effectiveAt.toISOString(),
    domain: 'reconfirmation',
    sourceKind: 'reconfirmation_expiration',
    action: 'mark_stale',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'acceptance_claim', id: row.claimId },
    secondaryTargets: [],
    reasonCode: row.reasonCode,
    summary: row.publicSummary,
    transition: { fromState: row.fromClaimStatus, toState: row.toClaimStatus },
    sourceRecordId: row.id,
  };
}

export function mediaReviewDecisionAuditItem(row: MediaReviewDecision): AuditHistoryItem {
  const secondary = subjectTarget(row.expectedSubjectType, row.expectedSubjectId);
  return {
    id: itemId('media_review_decision', row.id),
    occurredAt: row.decidedAt.toISOString(),
    domain: 'media',
    sourceKind: 'media_review_decision',
    action: row.action,
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'media_asset', id: row.mediaAssetId },
    secondaryTargets: secondary === null ? [] : [secondary],
    reasonCode: row.reasonCode,
    summary: row.publicSummary,
    transition: { fromState: row.expectedReviewStatus, toState: row.toReviewStatus },
    sourceRecordId: row.id,
  };
}

export function exportReleaseDecisionAuditItem(row: ExportReleaseDecision): AuditHistoryItem {
  return {
    id: itemId('export_release_decision', row.id),
    occurredAt: row.decidedAt.toISOString(),
    domain: 'export',
    sourceKind: 'export_release_decision',
    action: row.action === 'approve' ? 'approve_release' : 'reject_release',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'export_snapshot', id: row.snapshotDigest },
    secondaryTargets: [],
    reasonCode: row.reasonCode,
    summary: row.publicSummary,
    transition: { fromState: row.candidateStatus, toState: row.releaseStatus },
    sourceRecordId: row.id,
  };
}

export function exportActivationAuditItem(row: ExportActivationRecord): AuditHistoryItem {
  return {
    id: itemId('export_activation', row.id),
    occurredAt: row.publishedAt.toISOString(),
    domain: 'export',
    sourceKind: 'export_activation',
    action: 'activate_release',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'export_snapshot', id: row.snapshotDigest },
    secondaryTargets:
      row.previousSnapshotDigest === null
        ? []
        : [{ type: 'export_snapshot', id: row.previousSnapshotDigest }],
    reasonCode: row.reasonCode,
    summary: null,
    transition: null,
    sourceRecordId: row.id,
  };
}

export function exportRestoreExecutionAuditItem(
  row: ExportRestoreExecutionRecord,
): AuditHistoryItem {
  return {
    id: itemId('export_restore_execution', row.requestId),
    occurredAt: row.restoredAt,
    domain: 'export',
    sourceKind: 'export_restore_execution',
    action: 'restore_release',
    actorId: row.actorId,
    actorType: row.actorType,
    requestId: row.requestId,
    target: { type: 'export_snapshot', id: row.restoredSnapshotDigest },
    secondaryTargets: [{ type: 'export_snapshot', id: row.previousActiveSnapshotDigest }],
    reasonCode: row.reasonCode,
    summary: null,
    transition: null,
    sourceRecordId: row.requestId,
  };
}

export function submissionEventAuditItem(row: SubmissionEventAuditRow): AuditHistoryItem {
  return {
    id: itemId('submission_event', row.id),
    occurredAt: row.createdAt.toISOString(),
    domain: 'submission',
    sourceKind: 'submission_event',
    action: row.action,
    actorId: row.actorId,
    actorType: row.actorType === 'system' ? 'system' : 'human',
    requestId: null,
    target: { type: 'submission', id: row.publicId },
    secondaryTargets: [],
    reasonCode: row.reasonCode,
    summary: null,
    transition: { fromState: row.fromStatus, toState: row.toStatus },
    sourceRecordId: row.id,
  };
}
