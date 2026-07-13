import { describe, expect, it } from 'vitest';
import {
  buildReportSubmissionIntakeFromBrowserForm,
  emptyReportBrowserFormValues,
} from '../src/submissions/report-browser-contract';

const targetId = '10000000-0000-4000-8000-000000000001';
const duplicateId = '20000000-0000-4000-8000-000000000001';

describe('P5-03H report browser contract', () => {
  it('builds a strict successful payment report', () => {
    const values = emptyReportBrowserFormValues('2026-07-13', 'entity', targetId);
    values.privacyNoticeAccepted = true;
    values.submissionTermsAccepted = true;
    values.assetSlug = 'BTC';
    values.networkSlug = 'bitcoin';
    values.paymentResult = 'successful';
    values.paymentContext = 'qr_code';
    values.observedSteps = 'The merchant displayed a QR invoice and confirmed payment.';

    expect(buildReportSubmissionIntakeFromBrowserForm(values)).toEqual({
      schemaVersion: 'submission-common-v1',
      submissionType: 'payment_report',
      targetType: 'entity',
      targetId,
      relationship: null,
      contact: null,
      evidenceLinks: [],
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
      originalPayload: {
        schemaVersion: 'payment-report-v1',
        result: 'successful',
        paymentDate: '2026-07-13',
        payment: {
          assetSlug: 'btc',
          networkSlug: 'bitcoin',
          routeType: null,
          paymentMethod: null,
          processor: null,
          context: 'qr_code',
          observedSteps: 'The merchant displayed a QR invoice and confirmed payment.',
        },
        privateTransactionUrl: null,
        notes: null,
      },
    });
  });

  it('keeps restricted privacy evidence outside public evidence links', () => {
    const values = emptyReportBrowserFormValues('2026-07-13', 'location', targetId);
    values.submissionType = 'problem_report';
    values.problemType = 'privacy_issue';
    values.explanation = 'The public page includes information that should be reviewed privately.';
    values.privateEvidenceUrl = 'https://evidence.example/private-case';
    values.privacyNoticeAccepted = true;
    values.submissionTermsAccepted = true;

    const intake = buildReportSubmissionIntakeFromBrowserForm(values);
    expect(intake.submissionType).toBe('problem_report');
    expect(intake.evidenceLinks).toEqual([]);
    expect(intake.originalPayload).toMatchObject({
      reportType: 'privacy_issue',
      privateEvidenceUrl: 'https://evidence.example/private-case',
    });
  });

  it('builds a typed location-profile correction', () => {
    const values = emptyReportBrowserFormValues('2026-07-13', 'location', targetId);
    values.submissionType = 'problem_report';
    values.problemType = 'wrong_address';
    values.explanation = 'The listed address is no longer correct.';
    values.addressLine = '2 Corrected Street';
    values.countryCode = 'jp';
    values.privacyNoticeAccepted = true;
    values.submissionTermsAccepted = true;

    const intake = buildReportSubmissionIntakeFromBrowserForm(values);
    expect(intake.originalPayload).toMatchObject({
      proposedCorrection: {
        kind: 'location_profile',
        addressLine: '2 Corrected Street',
        countryCode: 'JP',
      },
    });
  });

  it('rejects a duplicate report that points to the same target', () => {
    const values = emptyReportBrowserFormValues('2026-07-13', 'entity', targetId);
    values.submissionType = 'problem_report';
    values.problemType = 'duplicate';
    values.explanation = 'This appears to duplicate the selected record.';
    values.duplicateTargetType = 'entity';
    values.duplicateTargetId = targetId;
    values.privacyNoticeAccepted = true;
    values.submissionTermsAccepted = true;

    expect(() => buildReportSubmissionIntakeFromBrowserForm(values)).toThrow();
  });

  it('accepts a distinct duplicate target', () => {
    const values = emptyReportBrowserFormValues('2026-07-13', 'entity', targetId);
    values.submissionType = 'problem_report';
    values.problemType = 'duplicate';
    values.explanation = 'This appears to duplicate another record.';
    values.duplicateTargetType = 'entity';
    values.duplicateTargetId = duplicateId;
    values.privacyNoticeAccepted = true;
    values.submissionTermsAccepted = true;

    expect(buildReportSubmissionIntakeFromBrowserForm(values).originalPayload).toMatchObject({
      duplicateTarget: { targetType: 'entity', targetId: duplicateId },
    });
  });
});
