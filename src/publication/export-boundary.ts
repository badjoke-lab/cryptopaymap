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
const blockedKeyPatterns = [
  /^internal/,
  /^private/,
  /storagekey$/,
  /payload$/,
  /^submission/,
  /^candidate/,
  /^review/,
  /^contact/,
  /^audit/,
  /credential/,
  /secret/,
  /tokenhash$/,
] as const;
const nonPublicUriSchemes = new Set(['file:', 'r2:', 's3:', 'gs:', 'data:']);

export class PublicExportBoundaryError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = 'PublicExportBoundaryError';
    this.issues = issues;
  }
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `$.${issue.path.join('.')}` : '$';
    return `${path}: ${issue.message}`;
  });
}

export function findNonPublicContent(value: unknown, path = '$'): string[] {
  const issues: string[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      issues.push(...findNonPublicContent(entry, `${path}[${index}]`));
    });
    return issues;
  }

  if (value === null || typeof value !== 'object') {
    return issues;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    const normalizedKey = normalizeKey(key);

    if (blockedKeyPatterns.some((pattern) => pattern.test(normalizedKey))) {
      issues.push(`${childPath}: field is outside the public contract`);
    }

    if (typeof child === 'string') {
      const separator = child.indexOf(':');
      const scheme = separator >= 0 ? child.slice(0, separator + 1).toLowerCase() : '';
      if (nonPublicUriSchemes.has(scheme)) {
        issues.push(`${childPath}: URI scheme is not publishable`);
      }
    }

    issues.push(...findNonPublicContent(child, childPath));
  }

  return issues;
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

  const nonPublicContent = findNonPublicContent(result.data);
  if (nonPublicContent.length > 0) {
    throw new PublicExportBoundaryError(`Non-public content was found in ${path}.`, nonPublicContent);
  }

  return result.data;
}
