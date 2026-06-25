import { defineConfig } from 'drizzle-kit';
import { readOptionalDatabaseEnvironment } from './src/schemas/environment';

const { DATABASE_URL } = readOptionalDatabaseEnvironment();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  migrations: {
    table: '__cpm_migrations',
    schema: 'drizzle',
  },
  ...(DATABASE_URL ? { dbCredentials: { url: DATABASE_URL } } : {}),
});
