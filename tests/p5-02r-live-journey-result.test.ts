import { describe, expect, it } from 'vitest';
import { buildP502rLiveJourneyResult } from '../scripts/p5-02r-live-journey-result.mjs';

function passingChecks() {
  return {
    firstHttpStatus: 202,
    firstReceiptValid: true,
    replayHttpStatus: 202,
    replayReceiptValid: true,
    replayReferenceMatches: true,
    replayStatusSecretMatches: true,
    changedContentHttpStatus: 409,
    conflictShapeMatches: true,
    publicArtifactsUnchanged: {
      '/data/manifest.json': true,
      '/version.json': true,
    },
  };
}

describe('P5-02R live journey result', () => {
  it('reports complete only when every required check passes', () => {
    const outcome = buildP502rLiveJourneyResult(passingChecks());

    expect(outcome.succeeded).toBe(true);
    expect(outcome.result.status).toBe('complete');
  });

  it('reports failed when replay identity does not match', () => {
    const outcome = buildP502rLiveJourneyResult({
      ...passingChecks(),
      replayReferenceMatches: false,
    });

    expect(outcome.succeeded).toBe(false);
    expect(outcome.result.status).toBe('failed');
  });

  it('reports failed when changed content does not conflict', () => {
    const outcome = buildP502rLiveJourneyResult({
      ...passingChecks(),
      conflictShapeMatches: false,
    });

    expect(outcome.succeeded).toBe(false);
    expect(outcome.result.status).toBe('failed');
  });

  it('reports failed when one public artifact changes', () => {
    const outcome = buildP502rLiveJourneyResult({
      ...passingChecks(),
      publicArtifactsUnchanged: {
        ...passingChecks().publicArtifactsUnchanged,
        '/version.json': false,
      },
    });

    expect(outcome.succeeded).toBe(false);
    expect(outcome.result.status).toBe('failed');
  });
});
