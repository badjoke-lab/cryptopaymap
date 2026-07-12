export function buildP502rLiveJourneyResult(checks) {
  const succeeded =
    checks.firstReceiptValid &&
    checks.replayReceiptValid &&
    checks.replayReferenceMatches &&
    checks.replayStatusSecretMatches &&
    checks.conflictShapeMatches &&
    Object.values(checks.publicArtifactsUnchanged).every(Boolean);

  return {
    succeeded,
    result: {
      status: succeeded ? 'complete' : 'failed',
      firstPost: {
        httpStatus: checks.firstHttpStatus,
        receiptShapeMatches: checks.firstReceiptValid,
      },
      exactReplay: {
        httpStatus: checks.replayHttpStatus,
        receiptShapeMatches: checks.replayReceiptValid,
        publicReferenceMatches: checks.replayReferenceMatches,
        statusSecretMatches: checks.replayStatusSecretMatches,
      },
      changedContent: {
        httpStatus: checks.changedContentHttpStatus,
        conflictShapeMatches: checks.conflictShapeMatches,
      },
      publicArtifactsUnchanged: checks.publicArtifactsUnchanged,
    },
  };
}
