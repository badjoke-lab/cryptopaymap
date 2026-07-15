import {
  createPhotoUploadAuthorizationHttpRuntimeFromEnvironment,
  type PhotoHttpEnvironment,
} from '../../../src/submissions/photo-http-environment';
import {
  createPhotoUploadAuthorizationHttpHandler,
  type PhotoHttpPagesContext,
} from '../../../src/submissions/photo-http';

export type PhotoUploadAuthorizationPagesContext = PhotoHttpPagesContext<PhotoHttpEnvironment>;

export const onRequestPost = createPhotoUploadAuthorizationHttpHandler({
  runtimeFromEnvironment: createPhotoUploadAuthorizationHttpRuntimeFromEnvironment,
});
