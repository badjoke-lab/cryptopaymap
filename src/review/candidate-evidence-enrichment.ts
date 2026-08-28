import {
  evidenceClassValues,
  evidenceKindValues,
  evidencePolarityValues,
  evidenceSourceTypeValues,
} from '../db/schema/evidence';

export interface CandidateEvidenceEnrichmentInput {
  candidateId: string;
  sourceUrl: string;
  sourceName: string | null;
  evidenceKind: (typeof evidenceKindValues)[number];
  evidenceClass: (typeof evidenceClassValues)[number];
  sourceType: (typeof evidenceSourceTypeValues)[number];
  polarity: (typeof evidencePolarityValues)[number];
  observedAt: Date | null;
  paymentMethod: string | null;
  network: string | null;
  howToPay: string | null;
  summary: string;
}

export interface CandidateEvidenceEnrichmentResult {
  candidateId: string;
  sourceUrl: string;
  sourceName: string | null;
  evidenceKind: CandidateEvidenceEnrichmentInput['evidenceKind'];
  evidenceClass: CandidateEvidenceEnrichmentInput['evidenceClass'];
  sourceType: CandidateEvidenceEnrichmentInput['sourceType'];
  polarity: CandidateEvidenceEnrichmentInput['polarity'];
  observedAt: Date | null;
  paymentMethod: string | null;
  network: string | null;
  howToPay: string | null;
  summary: string;
  freshness: 'current' | 'stale' | 'unknown';
  paymentDetailCompleteness: 'complete' | 'partial' | 'missing';
  reviewFlags: string[];
  eligibleForAutomaticConfirmation: false;
}

const STALE_AFTER_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1_000;

function normalizedHttpUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Evidence URLs must use HTTP or HTTPS.');
  }
  url.hash = '';
  return url.toString();
}

function freshness(
  observedAt: Date | null,
  referenceTime: Date,
): CandidateEvidenceEnrichmentResult['freshness'] {
  if (observedAt === null) return 'unknown';
  if (!Number.isFinite(observedAt.getTime()))
    throw new Error('Evidence observedAt must be a valid date.');
  const ageMs = referenceTime.getTime() - observedAt.getTime();
  return ageMs > STALE_AFTER_DAYS * DAY_MS ? 'stale' : 'current';
}

function detailCompleteness(
  input: CandidateEvidenceEnrichmentInput,
): CandidateEvidenceEnrichmentResult['paymentDetailCompleteness'] {
  const details = [input.paymentMethod, input.network, input.howToPay].filter(
    (value) => value !== null && value.trim().length > 0,
  ).length;
  if (details === 3) return 'complete';
  if (details === 0) return 'missing';
  return 'partial';
}

export function enrichCandidateEvidence(
  input: CandidateEvidenceEnrichmentInput,
  referenceTime = new Date(),
): CandidateEvidenceEnrichmentResult {
  if (input.summary.trim().length === 0) throw new Error('Evidence summary is required.');
  const sourceUrl = normalizedHttpUrl(input.sourceUrl);
  const evidenceFreshness = freshness(input.observedAt, referenceTime);
  const paymentDetailCompleteness = detailCompleteness(input);
  const reviewFlags: string[] = [];

  if (input.evidenceClass === 'c') reviewFlags.push('weak_evidence_only');
  if (input.sourceType === 'directory' || input.sourceType === 'openstreetmap') {
    reviewFlags.push('external_seed_requires_independent_evidence');
  }
  if (input.sourceType === 'search') reviewFlags.push('search_result_not_confirmation_evidence');
  if (evidenceFreshness === 'stale') reviewFlags.push('stale_evidence');
  if (evidenceFreshness === 'unknown') reviewFlags.push('unknown_observation_date');
  if (input.polarity === 'contradicting') reviewFlags.push('conflicting_evidence');
  if (paymentDetailCompleteness !== 'complete') reviewFlags.push('payment_details_incomplete');

  return {
    candidateId: input.candidateId,
    sourceUrl,
    sourceName: input.sourceName,
    evidenceKind: input.evidenceKind,
    evidenceClass: input.evidenceClass,
    sourceType: input.sourceType,
    polarity: input.polarity,
    observedAt: input.observedAt,
    paymentMethod: input.paymentMethod,
    network: input.network,
    howToPay: input.howToPay,
    summary: input.summary.trim(),
    freshness: evidenceFreshness,
    paymentDetailCompleteness,
    reviewFlags,
    eligibleForAutomaticConfirmation: false,
  };
}
