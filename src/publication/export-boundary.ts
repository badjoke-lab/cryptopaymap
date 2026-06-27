import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  publicExportPaths,
  publicExportSchemaByPath,
  type PublicExportPath,
} from '../schemas/public-exports';

export type PublicArtifactInput = Record<string, unknown>;
export type ValidatedPublicArtifactSet = Readonly<Record<PublicExportPath, unknown>>;

const publicExportPathSet = new Set<string>(publicExportPaths);

export class PublicExportBoundaryError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = 'PublicExportBoundaryError';
    this.issues = issues;
  }
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `$.${issue.path.join('.')}` : '$';
    return `${path}: ${issue.message}`;
  });
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }

  return value;
}

export function canonicalPublicJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value))}\n`;
}

export function hashPublicArtifact(value: unknown): string {
  return createHash('sha256').update(canonicalPublicJson(value)).digest('hex');
}

export function validatePublicArtifact(path: string, value: unknown): unknown {
  if (!publicExportPathSet.has(path)) {
    throw new PublicExportBoundaryError('Unrecognized public artifact path.', [
      `${path}: path is not in the public export allowlist`,
    ]);
  }

  const publicPath = path as PublicExportPath;
  const result = publicExportSchemaByPath[publicPath].safeParse(value);
  if (!result.success) {
    throw new PublicExportBoundaryError(`Public artifact schema validation failed for ${path}.`, [
      ...zodIssues(result.error),
    ]);
  }

  return result.data;
}
