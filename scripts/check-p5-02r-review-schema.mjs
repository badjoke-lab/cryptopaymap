import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
  throw new Error('P5-02R review schema check requires DATABASE_URL.');
}

const expectedTables = [
  'submission_public_reference_counters',
  'submissions',
  'submission_payloads',
  'submission_contacts',
  'submission_events',
];

const sql = neon(databaseUrl);
const rows = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name = any(${expectedTables})
`;
const present = new Set(rows.map((row) => row.table_name));
const tables = Object.fromEntries(expectedTables.map((name) => [name, present.has(name)]));
const ready = Object.values(tables).every(Boolean);

console.log(
  JSON.stringify(
    {
      status: ready ? 'ready' : 'missing_schema',
      tables,
    },
    null,
    2,
  ),
);

if (!ready) process.exitCode = 1;
