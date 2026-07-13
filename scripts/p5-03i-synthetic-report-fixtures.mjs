export function p503iSyntheticPaymentReport(targetId, challengeToken, observedSteps) {
  return {
    challengeToken,
    submission: {
      schemaVersion: 'submission-common-v1',
      submissionType: 'payment_report',
      targetType: 'entity',
      targetId,
      relationship: null,
      contact: null,
      evidenceLinks: [],
      originalPayload: {
        schemaVersion: 'payment-report-v1',
        result: 'successful',
        paymentDate: '2026-07-13',
        payment: {
          assetSlug: 'bitcoin',
          networkSlug: 'lightning',
          routeType: 'direct_wallet',
          paymentMethod: 'lightning_invoice',
          processor: null,
          context: 'qr_code',
          observedSteps,
        },
        privateTransactionUrl: null,
        notes: null,
      },
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
    },
  };
}

export function p503iSyntheticProblemReport(targetId, challengeToken) {
  return {
    challengeToken,
    submission: {
      schemaVersion: 'submission-common-v1',
      submissionType: 'problem_report',
      targetType: 'entity',
      targetId,
      relationship: null,
      contact: null,
      evidenceLinks: [],
      originalPayload: {
        schemaVersion: 'problem-report-v1',
        reportType: 'wrong_instructions',
        observedAt: '2026-07-13',
        explanation: 'P5-03I synthetic fixed-review problem report.',
        proposedCorrection: {
          kind: 'instructions',
          howToPay: 'Ask staff to display the current Lightning invoice before scanning.',
        },
        duplicateTarget: null,
        privateEvidenceUrl: null,
      },
      acknowledgements: {
        privacyNoticeAccepted: true,
        submissionTermsAccepted: true,
      },
    },
  };
}
