import { z } from 'zod';

type EnvironmentRecord = Readonly<Record<string, string | undefined>>;

function readProcessEnvironment(): EnvironmentRecord {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: EnvironmentRecord };
  };

  return runtime.process?.env ?? {};
}

export const databaseUrlSchema = z
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'postgres:' || protocol === 'postgresql:';
  }, 'DATABASE_URL must use the postgres or postgresql protocol.');

export const optionalDatabaseEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema.optional(),
});

export const requiredDatabaseEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export function readOptionalDatabaseEnvironment(
  environment: EnvironmentRecord = readProcessEnvironment(),
) {
  return optionalDatabaseEnvironmentSchema.parse(environment);
}

export function readRequiredDatabaseEnvironment(
  environment: EnvironmentRecord = readProcessEnvironment(),
) {
  return requiredDatabaseEnvironmentSchema.parse(environment);
}
