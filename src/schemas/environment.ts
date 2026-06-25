import { z } from 'zod';

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
  environment: NodeJS.ProcessEnv = process.env,
) {
  return optionalDatabaseEnvironmentSchema.parse(environment);
}

export function readRequiredDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return requiredDatabaseEnvironmentSchema.parse(environment);
}
