import { z } from 'zod';

const publicArtifactCheckSchema = z.record(z.string().min(1).max(128), z.boolean());

export const photoDirectUploadAuditInputSchema = z
  .object({
    clientConfigurationHttpStatus: z.number().int().min(0).max(599),
    clientConfigurationMatches: z.boolean(),
    photosPageHttpStatus: z.number().int().min(0).max(599),
    photosPageHeadersMatch: z.boolean(),
    authorizationHttpStatus: z.number().int().min(0).max(599),
    authorizationReceiptValid: z.boolean(),
    authorizationPrivateScopeMatches: z.boolean(),
    corsPreflightHttpStatus: z.number().int().min(0).max(599),
    corsPolicyMatches: z.boolean(),
    directPutHttpStatus: z.number().int().min(0).max(599),
    objectHeadHttpStatus: z.number().int().min(0).max(599),
    storedObjectMatches: z.boolean(),
    privateIntakeHttpStatus: z.number().int().min(0).max(599),
    privateIntakeReceiptValid: z.boolean(),
    databaseProjectionMatches: z.boolean(),
    automaticMediaAbsent: z.boolean(),
    publicArtifactsUnchanged: publicArtifactCheckSchema,
    cleanupDeleteHttpStatus: z.number().int().min(0).max(599),
    cleanupHeadHttpStatus: z.number().int().min(0).max(599),
    cleanupConfirmed: z.boolean(),
  })
  .strict();

export const photoDirectUploadAuditFailureCodeSchema = z.enum([
  'client_configuration',
  'photos_page_headers',
  'upload_authorization',
  'authorization_scope',
  'cors_policy',
  'direct_put',
  'stored_object',
  'private_intake',
  'database_projection',
  'automatic_media_boundary',
  'public_artifacts',
  'object_cleanup',
]);

export const photoDirectUploadAuditResultSchema = photoDirectUploadAuditInputSchema
  .extend({
    schemaVersion: z.literal('photo-direct-upload-audit-v1'),
    status: z.enum(['complete', 'failed']),
    failedChecks: z.array(photoDirectUploadAuditFailureCodeSchema).max(12),
  })
  .strict();

export type PhotoDirectUploadAuditInput = z.infer<typeof photoDirectUploadAuditInputSchema>;
export type PhotoDirectUploadAuditResult = z.infer<typeof photoDirectUploadAuditResultSchema>;

export function buildPhotoDirectUploadAuditResult(rawInput: PhotoDirectUploadAuditInput): {
  succeeded: boolean;
  result: PhotoDirectUploadAuditResult;
} {
  const input = photoDirectUploadAuditInputSchema.parse(rawInput);
  const failedChecks: Array<z.infer<typeof photoDirectUploadAuditFailureCodeSchema>> = [];

  if (input.clientConfigurationHttpStatus !== 200 || !input.clientConfigurationMatches) {
    failedChecks.push('client_configuration');
  }
  if (input.photosPageHttpStatus !== 200 || !input.photosPageHeadersMatch) {
    failedChecks.push('photos_page_headers');
  }
  if (input.authorizationHttpStatus !== 200 || !input.authorizationReceiptValid) {
    failedChecks.push('upload_authorization');
  }
  if (!input.authorizationPrivateScopeMatches) {
    failedChecks.push('authorization_scope');
  }
  if (![200, 204].includes(input.corsPreflightHttpStatus) || !input.corsPolicyMatches) {
    failedChecks.push('cors_policy');
  }
  if (![200, 201, 204].includes(input.directPutHttpStatus)) {
    failedChecks.push('direct_put');
  }
  if (input.objectHeadHttpStatus !== 200 || !input.storedObjectMatches) {
    failedChecks.push('stored_object');
  }
  if (input.privateIntakeHttpStatus !== 202 || !input.privateIntakeReceiptValid) {
    failedChecks.push('private_intake');
  }
  if (!input.databaseProjectionMatches) {
    failedChecks.push('database_projection');
  }
  if (!input.automaticMediaAbsent) {
    failedChecks.push('automatic_media_boundary');
  }
  if (
    Object.keys(input.publicArtifactsUnchanged).length === 0 ||
    Object.values(input.publicArtifactsUnchanged).some((unchanged) => !unchanged)
  ) {
    failedChecks.push('public_artifacts');
  }
  if (
    ![200, 202, 204].includes(input.cleanupDeleteHttpStatus) ||
    ![403, 404].includes(input.cleanupHeadHttpStatus) ||
    !input.cleanupConfirmed
  ) {
    failedChecks.push('object_cleanup');
  }

  const succeeded = failedChecks.length === 0;
  return {
    succeeded,
    result: photoDirectUploadAuditResultSchema.parse({
      schemaVersion: 'photo-direct-upload-audit-v1',
      status: succeeded ? 'complete' : 'failed',
      failedChecks,
      ...input,
    }),
  };
}
