export interface CandidateEvidenceSignal {
  evidenceClass: 'a' | 'b' | 'c';
  sourceType:
    | 'official_page'
    | 'official_social'
    | 'processor'
    | 'openstreetmap'
    | 'directory'
    | 'article'
    | 'search'
    | 'user_submission'
    | 'business_representative'
    | 'live_observation'
    | 'payment_proof'
    | 'other';
  polarity: 'supporting' | 'contradicting' | 'neutral';
  observedAt: Date | null;
}

export interface CandidateReviewReadinessInput {
  hasLocationMatch: boolean;
  duplicateRisk: 'none' | 'review' | 'strong';
  evidence: readonly CandidateEvidenceSignal[];
  hasAsset: boolean;
  hasNetwork: boolean;
  hasRouteType: boolean;
  hasPaymentMethod: boolean;
  hasHowToPay: boolean;
}

export interface CandidateReviewReadinessResult {
  score: number;
  tier: 'ready' | 'promising' | 'needs_enrichment' | 'blocked';
  reasons: string[];
  blockers: string[];
  automaticConfirmedCount: 0;
}

export function scoreCandidateReviewReadiness(
  input: CandidateReviewReadinessInput,
): CandidateReviewReadinessResult {
  let score = 0;
  const reasons: string[] = [];
  const blockers: string[] = [];

  const supporting = input.evidence.filter((item) => item.polarity === 'supporting');
  const contradicting = input.evidence.filter((item) => item.polarity === 'contradicting');
  const hasStrongOfficialEvidence = supporting.some(
    (item) => item.evidenceClass === 'a' && item.sourceType === 'official_page',
  );
  const hasStrongEvidence = supporting.some((item) => item.evidenceClass === 'a');
  const supportingBCount = supporting.filter((item) => item.evidenceClass === 'b').length;

  if (hasStrongOfficialEvidence) {
    score += 35;
    reasons.push('strong official evidence');
  } else if (hasStrongEvidence) {
    score += 30;
    reasons.push('strong evidence');
  } else if (supportingBCount >= 2) {
    score += 20;
    reasons.push('multiple medium-strength evidence signals');
  } else if (supporting.length > 0) {
    score += 8;
    reasons.push('supporting evidence exists');
  } else {
    blockers.push('no supporting evidence');
  }

  if (input.hasLocationMatch) {
    score += 15;
    reasons.push('location matched');
  } else {
    blockers.push('location not matched');
  }

  if (input.duplicateRisk === 'none') {
    score += 10;
    reasons.push('low duplicate risk');
  } else if (input.duplicateRisk === 'review') {
    score += 3;
    reasons.push('duplicate review required');
  } else {
    blockers.push('strong duplicate signal');
  }

  const paymentCompleteness = [
    input.hasAsset,
    input.hasNetwork,
    input.hasRouteType,
    input.hasPaymentMethod,
    input.hasHowToPay,
  ].filter(Boolean).length;
  score += paymentCompleteness * 8;

  if (input.hasAsset) reasons.push('asset identified');
  else blockers.push('asset missing');
  if (input.hasNetwork) reasons.push('network identified');
  else blockers.push('network missing');
  if (input.hasRouteType) reasons.push('route type identified');
  else blockers.push('route type missing');
  if (input.hasPaymentMethod) reasons.push('payment method identified');
  else blockers.push('payment method missing');
  if (input.hasHowToPay) reasons.push('How to pay available');
  else blockers.push('How to pay missing');

  if (contradicting.length > 0) {
    score = Math.max(0, score - 20);
    blockers.push('conflicting evidence requires review');
  }

  const boundedScore = Math.min(100, score);
  const tier =
    input.duplicateRisk === 'strong' || contradicting.length > 0
      ? 'blocked'
      : boundedScore >= 80 && blockers.length === 0
        ? 'ready'
        : boundedScore >= 55
          ? 'promising'
          : 'needs_enrichment';

  return {
    score: boundedScore,
    tier,
    reasons,
    blockers,
    automaticConfirmedCount: 0,
  };
}
