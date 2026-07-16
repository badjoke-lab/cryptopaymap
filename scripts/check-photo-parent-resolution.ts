import {
  authorizePhotoParentResolution,
  readPhotoParentResolutionAuthorizationPolicy,
} from '../src/admin/submissions/photo-parent-resolution-authorization';
import {
  photoParentResolutionReceiptSchema,
  photoParentResolutionRequestSchema,
  resolvePhotoParentSubmission,
} from '../src/admin/submissions/photo-parent-resolution';
import { createDrizzlePhotoParentResolutionBackend } from '../src/admin/submissions/drizzle-photo-parent-resolution-backend';
import {
  photoParentMediaDecisionSnapshotSchema,
  photoParentResolutionEventPayloadSchema,
  parsePhotoParentResolutionEventPayload,
  serializePhotoParentResolutionEventPayload,
} from '../src/submissions/photo-parent-resolution-contract';

for (const value of [
  photoParentResolutionRequestSchema,
  photoParentResolutionReceiptSchema,
  photoParentMediaDecisionSnapshotSchema,
  photoParentResolutionEventPayloadSchema,
]) {
  if (value === undefined) throw new Error('Photos parent-resolution schema is missing.');
}

for (const value of [
  authorizePhotoParentResolution,
  readPhotoParentResolutionAuthorizationPolicy,
  resolvePhotoParentSubmission,
  createDrizzlePhotoParentResolutionBackend,
  parsePhotoParentResolutionEventPayload,
  serializePhotoParentResolutionEventPayload,
]) {
  if (typeof value !== 'function') {
    throw new Error('Photos parent-resolution runtime export is missing.');
  }
}

console.log('Photos parent-resolution checks passed.');
