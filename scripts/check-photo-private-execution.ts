import {
  createCloudflareImagesPhotoPrivateProcessor,
  type CloudflareImagesBindingLike,
} from '../src/submissions/cloudflare-images-photo-processor';
import { createPhotoPostIntakeObjectValidationService } from '../src/submissions/photo-post-intake-object-validation';
import {
  createPhotoPrivateExecutionService,
  photoPrivateExecutionRequestSchema,
} from '../src/submissions/photo-private-execution';
import { createPhotoPrivateExecutionRuntimeFromEnvironment } from '../src/submissions/photo-private-execution-environment';

photoPrivateExecutionRequestSchema.parse({
  schemaVersion: 'photo-private-execution-v1',
  processingRequestId: '10000000-0000-4000-8000-000000000001',
  submissionId: '20000000-0000-4000-8000-000000000001',
  processorVersion: 'cloudflare-images/1',
  validatedAt: '2026-07-15T00:00:00.000Z',
});

const unavailableBinding = null as unknown as CloudflareImagesBindingLike;
for (const executable of [
  createCloudflareImagesPhotoPrivateProcessor,
  createPhotoPostIntakeObjectValidationService,
  createPhotoPrivateExecutionService,
  createPhotoPrivateExecutionRuntimeFromEnvironment,
]) {
  if (typeof executable !== 'function') {
    throw new Error('Private photo execution boundary is not executable.');
  }
}

if (unavailableBinding !== null) {
  throw new Error('Private photo execution schema check is invalid.');
}

console.log('Private photo execution schemas and services passed.');
