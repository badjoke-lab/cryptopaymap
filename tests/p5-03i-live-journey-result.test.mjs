import { describe, expect, it } from 'vitest';
import { buildP503iLiveJourneyResult } from '../scripts/p5-03i-live-journey-result.mjs';

function completeChecks() {
  return {
    clientConfigurationMatches: true,
    paymentPageHeadersMatch: true,
    problemPageHeadersMatch: true,
    paymentFirstHttpStatus: 202,
    paymentFirstReceiptValid: true,
    paymentReplayHttpStatus: 202,
    paymentReplayReceiptValid: true,
    paymentReplayReferenceMatches: true,
    paymentReplayStatusSecretMatches: true,
    paymentChangedContentHttpStatus: 409,
    paymentConflictShapeMatches: true,
    problemFirstHttpStatus: 202,
    problemFirstReceiptValid: true,
    problemReplayHttpStatus: 202,
    problemReplayReceiptValid: true,
    problemReplayReferenceMatches: true,
    problemReplayStatusSecretMatches: true,
    databasePaymentProjectionMatches: true,
    databaseProblemProjectionMatches: true,
    publicArtifactsUnchanged: {
      '/data/manifest.json': true,
      '/version.json': true,
    },
  };
}

describe('P5-03I bounded live journey result', () => {
  it('completes only when both report families and public artifacts pass', () => {
    const output = buildP503iLiveJourneyResult(completeChecks());
    expect(output.succeeded).toBe(true);
    expect(output.result.status).toBe('complete');
    expect(JSON.stringify(output.result)).not.toContain('statusSecret');
    expect(JSON.stringify(output.result)).not.toContain('challengeToken');
    expect(JSON.stringify(output.result)).not.toContain('DATABASE_URL');
  });

  it('fails closed when either database projection or replay check fails', () => {
    const databaseFailure = completeChecks();
    databaseFailure.databaseProblemProjectionMatches = false;
    expect(buildP503iLiveJourneyResult(databaseFailure).succeeded).toBe(false);

    const replayFailure = completeChecks();
    replayFailure.paymentReplayStatusSecretMatches = false;
    const output = buildP503iLiveJourneyResult(replayFailure);
    expect(output.succeeded).toBe(false);
    expect(output.result.status).toBe('failed');
  });
});
