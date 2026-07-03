import type { ExportPublicationR2BucketLike } from './activation-r2';
import { createR2ExportPublicationTarget } from './activation-r2';
import type { ExportPublicationAuthorizationEnvironment } from './publication-authorization';
import type { ExportReleaseEnvironment } from './http-environment';

export interface ExportActivationEnvironment
  extends ExportReleaseEnvironment,
    ExportPublicationAuthorizationEnvironment {
  CPM_EXPORT_PUBLIC_BUCKET?: ExportPublicationR2BucketLike;
}

export function exportPublicationTargetFromEnvironment(
  environment: ExportActivationEnvironment,
) {
  if (environment.CPM_EXPORT_PUBLIC_BUCKET === undefined) {
    throw new Error('The public export release bucket is unavailable.');
  }
  return createR2ExportPublicationTarget(environment.CPM_EXPORT_PUBLIC_BUCKET);
}
