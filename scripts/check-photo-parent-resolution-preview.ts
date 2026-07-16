import {
  loadPhotoParentResolutionPreview,
  photoParentResolutionExpectedRequestSchema,
  photoParentResolutionPreviewMediaSchema,
  photoParentResolutionPreviewResponseSchema,
} from '../src/admin/submissions/photo-parent-resolution-preview';
import { PhotoParentResolutionPanel } from '../src/components/admin/PhotoParentResolutionPanel';

for (const value of [
  photoParentResolutionExpectedRequestSchema,
  photoParentResolutionPreviewMediaSchema,
  photoParentResolutionPreviewResponseSchema,
]) {
  if (value === undefined) {
    throw new Error('Photos parent-resolution preview schema is missing.');
  }
}

for (const value of [loadPhotoParentResolutionPreview, PhotoParentResolutionPanel]) {
  if (typeof value !== 'function') {
    throw new Error('Photos parent-resolution preview runtime export is missing.');
  }
}

console.log('Photos parent-resolution preview checks passed.');
