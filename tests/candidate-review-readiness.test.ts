import { describe, expect, it } from 'vitest';
import { scoreCandidateReviewReadiness } from '../src/review/candidate-review-readiness';

describe('Candidate review-readiness scoring', () => {
  it('prioritizes complete evidence-rich Candidates without auto-confirming them', () => {
    const result = scoreCandidateReviewReadiness({
      hasLocationMatch: true,
      duplicateRisk: 'none',
      evidence: [
        {
          evidenceClass: 'a',
          sourceType: 'official_page',
          polarity: 'supporting',
          observedAt: new Date('2026-08-28T00:00:00.000Z'),
        },
      ],
      hasAsset: true,
      hasNetwork: true,
      hasRouteType: true,
      hasPaymentMethod: true,
      hasHowToPay: true,
    });

    expect(result.tier).toBe('ready');
    expect(result.score).toBe(100);
    expect(result.blockers).toEqual([]);
    expect(result.automaticConfirmedCount).toBe(0);
  });

  it('keeps directory-only incomplete Candidates in enrichment', () => {
    const result = scoreCandidateReviewReadiness({
      hasLocationMatch: true,
      duplicateRisk: 'review',
      evidence: [
        {
          evidenceClass: 'c',
          sourceType: 'directory',
          polarity: 'supporting',
          observedAt: null,
        },
      ],
      hasAsset: true,
      hasNetwork: false,
      hasRouteType: false,
      hasPaymentMethod: false,
      hasHowToPay: false,
    });

    expect(result.tier).toBe('needs_enrichment');
    expect(result.blockers).toContain('network missing');
    expect(result.blockers).toContain('How to pay missing');
    expect(result.automaticConfirmedCount).toBe(0);
  });

  it('blocks high-scoring Candidates when conflicting evidence exists', () => {
    const result = scoreCandidateReviewReadiness({
      hasLocationMatch: true,
      duplicateRisk: 'none',
      evidence: [
        {
          evidenceClass: 'a',
          sourceType: 'official_page',
          polarity: 'supporting',
          observedAt: new Date('2026-08-28T00:00:00.000Z'),
        },
        {
          evidenceClass: 'a',
          sourceType: 'official_page',
          polarity: 'contradicting',
          observedAt: new Date('2026-08-28T00:30:00.000Z'),
        },
      ],
      hasAsset: true,
      hasNetwork: true,
      hasRouteType: true,
      hasPaymentMethod: true,
      hasHowToPay: true,
    });

    expect(result.tier).toBe('blocked');
    expect(result.blockers).toContain('conflicting evidence requires review');
    expect(result.automaticConfirmedCount).toBe(0);
  });
});
