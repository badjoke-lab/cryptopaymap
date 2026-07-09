import { describe, expect, it } from 'vitest';
import {
  commonSubmissionIntakeSchema,
  formatSubmissionPublicId,
  publicStatusLabelForSubmission,
  submissionPublicStatusProjectionSchema,
  submissionRecordSchema,
} from '../src/submissions/contract';

function intake() {
  return {
    schemaVersion: 'submission-common-v1' as const,
    submissionType: 'suggest' as const,
    targetType: null,
    targetId: null,
    relationship: 'customer' as const,
    contact: {
      email: 'person@example.test',
      contactAllowed: true,
    },
    evidenceLinks: [
      {
        url: 'https://merchant.example/payments',
        observedAt: '2026-07-01',
        summary: 'Official payment information observed by the submitter.',
      },
    ],
    originalPayload: {
      name: 'Example Merchant',
      payment: {
        asset: 'BTC',
        network: 'bitcoin',
      },
    },
    acknowledgements: {
      privacyNoticeAccepted: true as const,
      submissionTermsAccepted: true as const,
    },
  };
}

describe('shared submission contract', () => {
  it('accepts a bounded common intake without rewriting the original payload', () => {
    const input = intake();
    const before = structuredClone(input.originalPayload);
    const parsed = commonSubmissionIntakeSchema.parse(input);

    expect(parsed.originalPayload).toEqual(before);
    expect(input.originalPayload).toEqual(before);
    expect(parsed.submissionType).toBe('suggest');
  });

  it('rejects unknown envelope fields and mismatched target identity', () => {
    expect(() => commonSubmissionIntakeSchema.parse({ ...intake(), privateFlag: true })).toThrow();
    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        targetType: 'location',
        targetId: null,
      }),
    ).toThrow();
  });

  it('rejects unsafe evidence URLs and HTML-like evidence summaries', () => {
    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        evidenceLinks: [
          {
            url: 'http://127.0.0.1/internal',
            observedAt: null,
            summary: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        evidenceLinks: [
          {
            url: 'http://[::1]/internal',
            observedAt: null,
            summary: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        evidenceLinks: [
          {
            url: 'https://user:secret@example.test/payments',
            observedAt: null,
            summary: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        evidenceLinks: [
          {
            url: 'https://example.test/payments',
            observedAt: null,
            summary: '<script>alert(1)</script>',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects payloads that exceed the common size or nesting boundary', () => {
    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        originalPayload: { note: 'x'.repeat(65_600) },
      }),
    ).toThrow();

    expect(() =>
      commonSubmissionIntakeSchema.parse({
        ...intake(),
        originalPayload: {
          a: { b: { c: { d: { e: { f: { g: { h: { i: 'too deep' } } } } } } } },
        },
      }),
    ).toThrow();
  });

  it('formats public references without exposing internal UUIDs', () => {
    expect(formatSubmissionPublicId(2026, 123)).toBe('CPM-S-2026-000123');
    expect(() => formatSubmissionPublicId(2026, 0)).toThrow();
    expect(() => formatSubmissionPublicId(2026, 1_000_000)).toThrow();
  });

  it('maps internal workflow state to bounded public-facing labels', () => {
    expect(publicStatusLabelForSubmission('received', null)).toBe('received');
    expect(publicStatusLabelForSubmission('triage', null)).toBe('received');
    expect(publicStatusLabelForSubmission('in_review', null)).toBe('under_review');
    expect(publicStatusLabelForSubmission('needs_information', null)).toBe(
      'more_information_needed',
    );
    expect(publicStatusLabelForSubmission('on_hold', null)).toBe('on_hold');
    expect(publicStatusLabelForSubmission('resolved', 'approved')).toBe('approved');
    expect(publicStatusLabelForSubmission('resolved', 'partially_approved')).toBe(
      'partially_approved',
    );
    expect(publicStatusLabelForSubmission('resolved', 'accepted_as_candidate')).toBe(
      'accepted_as_candidate',
    );
    expect(publicStatusLabelForSubmission('resolved', 'not_approved')).toBe('not_approved');
    expect(publicStatusLabelForSubmission('duplicate', 'duplicate')).toBe('closed');
    expect(publicStatusLabelForSubmission('withdrawn', 'withdrawn')).toBe('closed');
  });

  it('requires a resolution for resolved submission records', () => {
    const record = {
      id: '10000000-0000-4000-8000-000000000001',
      publicId: 'CPM-S-2026-000123',
      submissionType: 'suggest',
      targetType: null,
      targetId: null,
      workflowStatus: 'resolved',
      resolution: null,
      priority: null,
      statusTokenHash: `sha256:${'a'.repeat(64)}`,
      submittedAt: '2026-07-09T00:00:00.000Z',
      updatedAt: '2026-07-09T01:00:00.000Z',
      resolvedAt: '2026-07-09T01:00:00.000Z',
      withdrawnAt: null,
    };

    expect(() => submissionRecordSchema.parse(record)).toThrow();
    expect(submissionRecordSchema.parse({ ...record, resolution: 'approved' }).resolution).toBe(
      'approved',
    );
  });

  it('rejects private review fields from the public status projection', () => {
    const safe = {
      publicId: 'CPM-S-2026-000123',
      statusLabel: 'under_review',
      requestedAction: null,
      publicMessage: 'The submission is under review.',
      linkedPublicRecord: null,
      mediaDecisions: [],
      permittedActions: ['withdraw'],
    } as const;

    expect(submissionPublicStatusProjectionSchema.parse(safe)).toEqual(safe);
    expect(() =>
      submissionPublicStatusProjectionSchema.parse({
        ...safe,
        internalNote: 'private reviewer note',
        reviewerIdentity: 'operator@example.test',
        contactEmail: 'person@example.test',
      }),
    ).toThrow();
  });
});
