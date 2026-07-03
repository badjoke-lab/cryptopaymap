import { canonicalPublicJson } from '../../publication/export-boundary';
import {
  activeExportReleasePointerSchema,
  ExportPublicationError,
  type ActiveExportReleasePointer,
  type ActiveExportReleaseState,
  type ExportPublicationObject,
  type ExportPublicationPlan,
  type ExportPublicationTarget,
} from './publication-contract';

export interface ExportPublicationR2ObjectLike {
  key: string;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface ExportPublicationR2BodyLike extends ExportPublicationR2ObjectLike {
  json<T>(): Promise<T>;
}

export interface ExportPublicationR2BucketLike {
  head(key: string): Promise<ExportPublicationR2ObjectLike | null>;
  get(key: string): Promise<ExportPublicationR2BodyLike | null>;
  put(
    key: string,
    value: string,
    options: {
      onlyIf?: { etagMatches?: string; etagDoesNotMatch?: string };
      httpMetadata: { contentType: string; cacheControl?: string };
      customMetadata: Record<string, string>;
    },
  ): Promise<ExportPublicationR2ObjectLike | null>;
}

function expectedMetadata(
  object: ExportPublicationObject,
  snapshotDigest: string,
): Record<string, string> {
  return {
    snapshotDigest,
    artifactPath: object.path,
    sha256: object.sha256,
  };
}

function assertObject(
  object: ExportPublicationR2ObjectLike | null,
  expected: ExportPublicationObject,
  snapshotDigest: string,
): void {
  const metadata = expectedMetadata(expected, snapshotDigest);
  if (
    object === null ||
    object.key !== expected.objectKey ||
    object.size !== expected.canonicalByteSize ||
    object.httpMetadata?.contentType !== expected.mediaType ||
    object.customMetadata?.snapshotDigest !== metadata.snapshotDigest ||
    object.customMetadata?.artifactPath !== metadata.artifactPath ||
    object.customMetadata?.sha256 !== metadata.sha256
  ) {
    throw new ExportPublicationError(
      'target_failure',
      'An immutable export release object does not match the publication plan.',
      [expected.objectKey],
    );
  }
}

export function createR2ExportPublicationTarget(
  bucket: ExportPublicationR2BucketLike,
  pointerKey = 'export-releases/active.json',
): ExportPublicationTarget {
  return {
    async readActivePointer(): Promise<ActiveExportReleaseState | null> {
      const object = await bucket.get(pointerKey);
      if (object === null) return null;
      let raw: unknown;
      try {
        raw = await object.json<unknown>();
      } catch (error) {
        throw new ExportPublicationError(
          'target_failure',
          'The active export release pointer is not valid JSON.',
          [pointerKey],
          { cause: error },
        );
      }
      const result = activeExportReleasePointerSchema.safeParse(raw);
      if (!result.success) {
        throw new ExportPublicationError(
          'target_failure',
          'The active export release pointer is invalid.',
          result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      return { pointer: result.data, versionToken: object.etag };
    },

    async stageRelease(plan: ExportPublicationPlan): Promise<void> {
      for (const object of plan.objects) {
        const existing = await bucket.head(object.objectKey);
        if (existing !== null) {
          assertObject(existing, object, plan.pointer.snapshotDigest);
          continue;
        }
        const stored = await bucket.put(object.objectKey, object.body, {
          onlyIf: { etagDoesNotMatch: '*' },
          httpMetadata: {
            contentType: object.mediaType,
            cacheControl: 'public, max-age=31536000, immutable',
          },
          customMetadata: expectedMetadata(object, plan.pointer.snapshotDigest),
        });
        if (stored === null) {
          assertObject(await bucket.head(object.objectKey), object, plan.pointer.snapshotDigest);
        } else {
          assertObject(stored, object, plan.pointer.snapshotDigest);
        }
      }
    },

    async activateRelease(
      pointer: ActiveExportReleasePointer,
      expectedVersionToken: string | null,
    ): Promise<void> {
      const body = canonicalPublicJson(pointer);
      const stored = await bucket.put(pointerKey, body, {
        onlyIf:
          expectedVersionToken === null
            ? { etagDoesNotMatch: '*' }
            : { etagMatches: expectedVersionToken },
        httpMetadata: {
          contentType: 'application/json',
          cacheControl: 'public, max-age=60, must-revalidate',
        },
        customMetadata: {
          snapshotDigest: pointer.snapshotDigest,
          datasetVersion: pointer.datasetVersion,
          schemaVersion: pointer.schemaVersion,
        },
      });
      if (stored === null) {
        throw new ExportPublicationError(
          'pointer_conflict',
          'The active export release pointer changed during activation.',
          ['activePointer'],
        );
      }
    },
  };
}
