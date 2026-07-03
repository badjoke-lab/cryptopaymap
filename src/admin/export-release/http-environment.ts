import { createDatabase, type CryptoPayMapDatabase } from '../../db/client';
import { requiredDatabaseEnvironmentSchema } from '../../schemas/environment';
import type { ExportReleaseAuthorizationEnvironment } from './authorization';
import {
  createR2ExportArtifactSource,
  ExportArtifactSourceError,
  type ExportArtifactSource,
  type ExportCandidateR2BucketLike,
} from './artifact-source';

export interface ExportReleaseEnvironment extends ExportReleaseAuthorizationEnvironment {
  DATABASE_URL?: string;
  CPM_EXPORT_CANDIDATE_BUCKET?: ExportCandidateR2BucketLike;
  CPM_EXPORT_CANDIDATE_KEY?: string;
}

export function exportReleaseDatabase(
  environment: ExportReleaseEnvironment,
): CryptoPayMapDatabase {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) {
    throw new ExportArtifactSourceError(
      'configuration',
      'The export release database is unavailable.',
    );
  }
  return createDatabase(result.data.DATABASE_URL);
}

export function exportArtifactSourceFromEnvironment(
  environment: ExportReleaseEnvironment,
): ExportArtifactSource {
  if (
    environment.CPM_EXPORT_CANDIDATE_BUCKET === undefined ||
    typeof environment.CPM_EXPORT_CANDIDATE_KEY !== 'string'
  ) {
    throw new ExportArtifactSourceError(
      'configuration',
      'The private export candidate binding is unavailable.',
    );
  }
  return createR2ExportArtifactSource(
    environment.CPM_EXPORT_CANDIDATE_BUCKET,
    environment.CPM_EXPORT_CANDIDATE_KEY,
  );
}
