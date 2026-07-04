import { createDatabase, type CryptoPayMapDatabase } from '../../db/client';
import { requiredDatabaseEnvironmentSchema } from '../../schemas/environment';
import type { AuditHistoryAuthorizationEnvironment } from './authorization';

export interface AuditHistoryEnvironment extends AuditHistoryAuthorizationEnvironment {
  DATABASE_URL?: string;
}

export type AuditHistoryEnvironmentErrorCode = 'configuration';

export class AuditHistoryEnvironmentError extends Error {
  readonly code: AuditHistoryEnvironmentErrorCode;

  constructor(code: AuditHistoryEnvironmentErrorCode, message: string) {
    super(message);
    this.name = 'AuditHistoryEnvironmentError';
    this.code = code;
  }
}

export function auditHistoryDatabase(environment: AuditHistoryEnvironment): CryptoPayMapDatabase {
  const result = requiredDatabaseEnvironmentSchema.safeParse({
    DATABASE_URL:
      typeof environment.DATABASE_URL === 'string' ? environment.DATABASE_URL : undefined,
  });
  if (!result.success) {
    throw new AuditHistoryEnvironmentError(
      'configuration',
      'The audit history database is unavailable.',
    );
  }
  return createDatabase(result.data.DATABASE_URL);
}
