import { z } from 'zod';
import {
  publicExportPaths,
  publicExportSchemaByPath,
  publicManifestFileSchema,
  publicVersionSchema,
  type PublicExportPath,
} from '../schemas/public-exports';

export type PublicArtifactInput = Record<string, unknown>;
export type ValidatedPublicArtifactSet = Readonly<Record<PublicExportPath, unknown>>;

const publicExportPathSet = new Set<string>(publicExportPaths);
const manifestPath: PublicExportPath = '/data/manifest.json';
const manifestInventoryPaths = publicExportPaths.filter((path) => path !== manifestPath);
const manifestInventoryPathSet = new Set<PublicExportPath>(manifestInventoryPaths);
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

export async function hashPublicArtifact(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPublicJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
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
    throw new PublicExportBoundaryError(
      `Non-public content was found in ${path}.`,
      nonPublicContent,
    );
  }

  return result.data;
}

function recordCount(path: PublicExportPath, value: unknown): number {
  if (path === '/version.json' || path === '/data/stats.json') {
    return 1;
  }

  if (path === '/data/places.geojson') {
    return (value as { features: unknown[] }).features.length;
  }

  return (value as { records: unknown[] }).records.length;
}

function expectedMediaType(path: PublicExportPath): 'application/json' | 'application/geo+json' {
  return path === '/data/places.geojson' ? 'application/geo+json' : 'application/json';
}

function artifactSchemaVersion(value: unknown): string {
  return (value as { schemaVersion: string }).schemaVersion;
}

function artifactGeneratedAt(value: unknown): string {
  return (value as { generatedAt: string }).generatedAt;
}

export async function validatePublicArtifactSet(
  input: PublicArtifactInput,
): Promise<ValidatedPublicArtifactSet> {
  const issues: string[] = [];
  const inputPaths = Object.keys(input);

  for (const path of inputPaths) {
    if (!publicExportPathSet.has(path)) {
      issues.push(`${path}: path is not in the public export allowlist`);
    }
  }

  for (const path of publicExportPaths) {
    if (!Object.hasOwn(input, path)) {
      issues.push(`${path}: required public artifact is missing`);
    }
  }

  if (issues.length > 0) {
    throw new PublicExportBoundaryError(
      'Public artifact set is incomplete or contains extra files.',
      issues,
    );
  }

  const parsed = {} as Record<PublicExportPath, unknown>;
  for (const path of publicExportPaths) {
    try {
      parsed[path] = validatePublicArtifact(path, input[path]);
    } catch (error) {
      if (error instanceof PublicExportBoundaryError) {
        issues.push(...error.issues.map((issue) => `${path} ${issue}`));
      } else {
        throw error;
      }
    }
  }

  if (issues.length > 0) {
    throw new PublicExportBoundaryError('One or more public artifacts failed validation.', issues);
  }

  const manifest = publicManifestFileSchema.parse(parsed[manifestPath]);
  const version = publicVersionSchema.parse(parsed['/version.json']);

  if (manifest.datasetVersion !== version.datasetVersion) {
    issues.push('manifest and version datasetVersion values do not match');
  }
  if (manifest.schemaVersion !== version.schemaVersion) {
    issues.push('manifest and version schemaVersion values do not match');
  }
  if (manifest.generatedAt !== version.generatedAt) {
    issues.push('manifest and version generatedAt values do not match');
  }

  for (const path of publicExportPaths) {
    if (artifactGeneratedAt(parsed[path]) !== version.generatedAt) {
      issues.push(`${path}: generatedAt does not match the release version`);
    }
    if (artifactSchemaVersion(parsed[path]) !== version.schemaVersion) {
      issues.push(`${path}: schemaVersion does not match the release version`);
    }
  }

  const manifestEntries = new Map<PublicExportPath, (typeof manifest.files)[number]>();
  for (const entry of manifest.files) {
    if (manifestEntries.has(entry.path)) {
      issues.push(`${entry.path}: duplicate manifest entry`);
    }
    manifestEntries.set(entry.path, entry);
  }

  for (const path of manifestInventoryPaths) {
    const entry = manifestEntries.get(path);
    if (entry === undefined) {
      issues.push(`${path}: missing manifest entry`);
      continue;
    }

    if (entry.mediaType !== expectedMediaType(path)) {
      issues.push(`${path}: manifest media type does not match the artifact`);
    }
    if (entry.schemaVersion !== artifactSchemaVersion(parsed[path])) {
      issues.push(`${path}: manifest schema version does not match the artifact`);
    }
    if (entry.recordCount !== recordCount(path, parsed[path])) {
      issues.push(`${path}: manifest record count does not match the artifact`);
    }
    if (entry.sha256 !== (await hashPublicArtifact(parsed[path]))) {
      issues.push(`${path}: manifest SHA-256 does not match the artifact`);
    }
  }

  for (const path of manifestEntries.keys()) {
    if (!manifestInventoryPathSet.has(path)) {
      issues.push(`${path}: manifest entry is not part of the release inventory`);
    }
  }

  if (manifestEntries.size !== manifestInventoryPaths.length) {
    issues.push('manifest inventory must contain exactly one entry for every publishable file');
  }

  if (issues.length > 0) {
    throw new PublicExportBoundaryError('Public artifact set failed release validation.', issues);
  }

  return deepFreeze(parsed) as ValidatedPublicArtifactSet;
}

export async function publicSnapshotDigest(
  artifacts: ValidatedPublicArtifactSet,
): Promise<string> {
  return hashPublicArtifact(
    Object.fromEntries(publicExportPaths.map((path) => [path, artifacts[path]])),
  );
}
