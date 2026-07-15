import {
  createPhotoPrivateIntakeHttpRuntimeFromEnvironment,
  type PhotoHttpEnvironment,
} from '../../src/submissions/photo-http-environment';
import {
  createPhotoPrivateIntakeHttpHandler,
  type PhotoHttpPagesContext,
} from '../../src/submissions/photo-http';

export type PhotoPrivateIntakePagesContext = PhotoHttpPagesContext<PhotoHttpEnvironment>;

export const onRequestPost = createPhotoPrivateIntakeHttpHandler({
  runtimeFromEnvironment: createPhotoPrivateIntakeHttpRuntimeFromEnvironment,
});
