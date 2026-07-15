import { describe, expect, it } from 'vitest';
import {
  buildPhotoDirectUploadAuditResult,
  photoDirectUploadAuditResultSchema,
} from '../src/submissions/photo-direct-upload-audit';

function completeInput() {
  return {
    clientConfigurationHttpStatus: 200,
    clientConfigurationMatches: true,
    photosPageHttpStatus: 200,
    photosPageHeadersMatch: true,
    authorizationHttpStatus: 200,
    authorizationReceiptValid: true,
    authorizationPrivateScopeMatches: true,
    directPutHttpStatus: 200,
    objectHeadHttpStatus: 200,
    storedObjectMatches: true,
    privateIntakeHttpStatus: 202,
    privateIntakeReceiptValid: true,
    databaseProjectionMatches: true,
    automaticMediaAbsent: true,
    publicArtifactsUnchanged: {
      '/data/manifest.json': true,
      '/version.json': true,
    },
    cleanupDeleteHttpStatus: 204,
    cleanupHeadHttpStatus: 404,
    cleanupConfirmed: true,
  };
}

describe('P5-05I direct-upload audit result', () => {
  it('completes only when upload, private intake, non-public effects, and cleanup all pass', () => {
    const { succeeded, result } = buildPhotoDirectUploadAuditResult(completeInput());
    expect(succeeded).toBe(true);
    expect(result.status).toBe('complete');
    expect(result.failedChecks).toEqual([]);
    expect(photoDirectUploadAuditResultSchema.parse(result)).toEqual(result);
  });

  it('reports bounded failure codes without private values', () => {
    const { succeeded, result } = buildPhotoDirectUploadAuditResult({
      ...completeInput(),
      authorizationPrivateScopeMatches: false,
      storedObjectMatches: false,
      automaticMediaAbsent: false,
      publicArtifactsUnchanged: { '/data/manifest.json': false },
      cleanupConfirmed: false,
    });

    expect(succeeded).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.failedChecks).toEqual([
      'authorization_scope',
      'stored_object',
      'automatic_media_boundary',
      'public_artifacts',
      'object_cleanup',
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('uploadUrl');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('statusSecret');
    expect(serialized).not.toContain('accessKey');
    expect(serialized).not.toContain('contact');
  });

  it('requires a non-empty public artifact comparison set', () => {
    const { result } = buildPhotoDirectUploadAuditResult({
      ...completeInput(),
      publicArtifactsUnchanged: {},
    });
    expect(result.failedChecks).toContain('public_artifacts');
  });
});
