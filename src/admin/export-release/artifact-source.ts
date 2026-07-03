import { z } from 'zod';
import type { PublicArtifactInput } from '../../publication/export-boundary';

export const exportCandidateBundleSchema = z
  .object({
    formatVersion: z.literal('1'),
    artifacts: z.record(z.string().min(1).max(256), z.unknown()),
  })
  .strict();

export type ExportCandidateBundle = z.infer<typeof exportCandidateBundleSchema>;

export interface ExportArtifactSource {
  loadArtifacts(): Promise<PublicArtifactInput | null>;
}

export interface ExportCandidateR2ObjectLike {
  json<T>(): Promise<T>;
}

export interface ExportCandidateR2BucketLike {
  get(key: string): Promise<ExportCandidateR2ObjectLike | null>;
}

export type ExportArtifactSourceErrorCode =
  | 'configuration'
  | 'not_found'
  | 'invalid_bundle'
  | 'backend_failure';

export class ExportArtifactSourceError extends Error {
  readonly code: ExportArtifactSourceErrorCode;
  readonly issues: readonly string[];

  constructor(
    code: ExportArtifactSourceErrorCode,
    message: string,
    issues: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ExportArtifactSourceError';
    this.code = code;
    this.issues = issues;
  }
}

export const exportCandidateKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^export-candidates\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.json$/)
  .refine((value) => !value.includes('..'), 'Export candidate keys cannot contain parent segments.');

export function createR2ExportArtifactSource(
  bucket: ExportCandidateR2BucketLike,
  key: string,
): ExportArtifactSource {
  const keyResult = exportCandidateKeySchema.safeParse(key);
  if (!keyResult.success) {
    throw new ExportArtifactSourceError(
      'configuration',
      'The export candidate object key is invalid.',
      keyResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }

  return {
    async loadArtifacts() {
      let object: ExportCandidateR2ObjectLike | null;
      try {
        object = await bucket.get(keyResult.data);
      } catch (error) {
        throw new ExportArtifactSourceError(
          'backend_failure',
          'The private export candidate object could not be loaded.',
          [],
          { cause: error },
        );
      }
      if (object === null) return null;

      let raw: unknown;
      try {
        raw = await object.json<unknown>();
      } catch (error) {
        throw new ExportArtifactSourceError(
          'invalid_bundle',
          'The private export candidate object is not valid JSON.',
          [],
          { cause: error },
        );
      }

      const result = exportCandidateBundleSchema.safeParse(raw);
      if (!result.success) {
        throw new ExportArtifactSourceError(
          'invalid_bundle',
          'The private export candidate bundle is invalid.',
          result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        );
      }
      return result.data.artifacts;
    },
  };
}
