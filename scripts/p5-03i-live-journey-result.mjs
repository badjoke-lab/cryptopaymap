export function buildP503iLiveJourneyResult(checks) {
  const succeeded =
    checks.clientConfigurationMatches &&
    checks.paymentPageHeadersMatch &&
    checks.problemPageHeadersMatch &&
    checks.paymentFirstReceiptValid &&
    checks.paymentReplayReceiptValid &&
    checks.paymentReplayReferenceMatches &&
    checks.paymentReplayStatusSecretMatches &&
    checks.paymentConflictShapeMatches &&
    checks.problemFirstReceiptValid &&
    checks.problemReplayReceiptValid &&
    checks.problemReplayReferenceMatches &&
    checks.problemReplayStatusSecretMatches &&
    checks.databasePaymentProjectionMatches &&
    checks.databaseProblemProjectionMatches &&
    Object.values(checks.publicArtifactsUnchanged).every(Boolean);

  return {
    succeeded,
    result: {
      status: succeeded ? 'complete' : 'failed',
      clientConfigurationMatches: checks.clientConfigurationMatches,
      publicPages: {
        paymentHeadersMatch: checks.paymentPageHeadersMatch,
        problemHeadersMatch: checks.problemPageHeadersMatch,
      },
      paymentReport: {
        firstHttpStatus: checks.paymentFirstHttpStatus,
        firstReceiptShapeMatches: checks.paymentFirstReceiptValid,
        replayHttpStatus: checks.paymentReplayHttpStatus,
        replayReceiptShapeMatches: checks.paymentReplayReceiptValid,
        replayReferenceMatches: checks.paymentReplayReferenceMatches,
        replayStatusSecretMatches: checks.paymentReplayStatusSecretMatches,
        changedContentHttpStatus: checks.paymentChangedContentHttpStatus,
        conflictShapeMatches: checks.paymentConflictShapeMatches,
        databaseProjectionMatches: checks.databasePaymentProjectionMatches,
      },
      problemReport: {
        firstHttpStatus: checks.problemFirstHttpStatus,
        firstReceiptShapeMatches: checks.problemFirstReceiptValid,
        replayHttpStatus: checks.problemReplayHttpStatus,
        replayReceiptShapeMatches: checks.problemReplayReceiptValid,
        replayReferenceMatches: checks.problemReplayReferenceMatches,
        replayStatusSecretMatches: checks.problemReplayStatusSecretMatches,
        databaseProjectionMatches: checks.databaseProblemProjectionMatches,
      },
      publicArtifactsUnchanged: checks.publicArtifactsUnchanged,
    },
  };
}
