export function postgresMediaReviewErrorCode(error: unknown): string | null {
  if (error === null || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function isMediaReviewConflictCode(code: string | null): boolean {
  return code !== null && ['22012', '23503', '23505', '23514'].includes(code);
}
