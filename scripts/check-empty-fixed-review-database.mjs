import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  throw new Error('Fixed-review database preflight requires DATABASE_URL.');
}

const sql = neon(databaseUrl);
const tableRows = await sql`
  select count(*)::integer as table_count
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
`;
const migrationRows = await sql`
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'drizzle'
      and table_name = '__cpm_migrations'
  ) as exists
`;

const publicTableCount = tableRows[0]?.table_count ?? null;
const migrationTableExists = migrationRows[0]?.exists === true;
const empty = publicTableCount === 0 && !migrationTableExists;

console.log(
  JSON.stringify(
    {
      status: empty ? 'empty' : 'not_empty',
      publicTableCount,
      migrationTableExists,
    },
    null,
    2,
  ),
);

if (!empty) process.exitCode = 1;
