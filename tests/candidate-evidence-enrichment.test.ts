import { describe, expect, it } from 'vitest';
import { enrichCandidateEvidence } from '../src/review/candidate-evidence-enrichment';

const referenceTime = new Date('2026-08-28T00:00:00.000Z');

describe('Candidate evidence enrichment', () => {
  it('marks official current evidence with complete payment details as review-ready input only', () => {
    const result = enrichCandidateEvidence(
      {
        candidateId: '00000000-0000-4000-8000-000000000201',
        sourceUrl: 'https://merchant.example/payments#crypto',
        sourceName: 'Merchant payments',
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        polarity: 'supporting',
        observedAt: new Date('2026-08-27T00:00:00.000Z'),
        paymentMethod: 'wallet_qr',
        network: 'bitcoin',
        howToPay: 'Ask staff for the payment QR and scan it with a Bitcoin wallet.',
        summary: 'Official payment page describes direct Bitcoin payment.',
      },
      referenceTime,
    );

    expect(result.sourceUrl).toBe('https://merchant.example/payments');
    expect(result.freshness).toBe('current');
    expect(result.paymentDetailCompleteness).toBe('complete');
    expect(result.reviewFlags).toEqual([]);
    expect(result.eligibleForAutomaticConfirmation).toBe(false);
  });

  it('flags OSM and directory evidence as seed material requiring independent evidence', () => {
    const result = enrichCandidateEvidence(
      {
        candidateId: '00000000-0000-4000-8000-000000000202',
        sourceUrl: 'https://www.openstreetmap.org/node/1',
        sourceName: 'OpenStreetMap',
        evidenceKind: 'undated_osm_tag',
        evidenceClass: 'c',
        sourceType: 'openstreetmap',
        polarity: 'supporting',
        observedAt: null,
        paymentMethod: null,
        network: null,
        howToPay: null,
        summary: 'OSM payment tag indicates possible crypto acceptance.',
      },
      referenceTime,
    );

    expect(result.freshness).toBe('unknown');
    expect(result.paymentDetailCompleteness).toBe('missing');
    expect(result.reviewFlags).toContain('weak_evidence_only');
    expect(result.reviewFlags).toContain('external_seed_requires_independent_evidence');
    expect(result.reviewFlags).toContain('payment_details_incomplete');
    expect(result.eligibleForAutomaticConfirmation).toBe(false);
  });

  it('surfaces stale contradictory evidence as a blocking review signal', () => {
    const result = enrichCandidateEvidence(
      {
        candidateId: '00000000-0000-4000-8000-000000000203',
        sourceUrl: 'https://merchant.example/help',
        sourceName: 'Merchant help',
        evidenceKind: 'official_payment_page',
        evidenceClass: 'a',
        sourceType: 'official_page',
        polarity: 'contradicting',
        observedAt: new Date('2025-01-01T00:00:00.000Z'),
        paymentMethod: null,
        network: null,
        howToPay: null,
        summary: 'Official page says crypto payments are no longer available.',
      },
      referenceTime,
    );

    expect(result.freshness).toBe('stale');
    expect(result.reviewFlags).toContain('stale_evidence');
    expect(result.reviewFlags).toContain('conflicting_evidence');
    expect(result.eligibleForAutomaticConfirmation).toBe(false);
  });
});
