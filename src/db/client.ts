import { drizzle } from 'drizzle-orm/neon-http';
import { databaseUrlSchema } from '../schemas/environment';
import * as schema from './schema';

export function createDatabase(databaseUrl: string) {
  const validatedUrl = databaseUrlSchema.parse(databaseUrl);
  return drizzle(validatedUrl, { schema });
}

export type CryptoPayMapDatabase = ReturnType<typeof createDatabase>;
