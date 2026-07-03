export function postgresExportReleaseErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function isExportReleaseConflictCode(code: string | null): boolean {
  return code !== null && ['23505', '23514'].includes(code);
}
