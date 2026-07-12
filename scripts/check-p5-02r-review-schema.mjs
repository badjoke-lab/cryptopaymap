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
const expectedSubmissionColumns = [
  'id',
  'intake_request_id',
  'request_fingerprint',
  'public_id',
  'submission_type',
  'target_type',
  'target_id',
  'relationship',
  'workflow_status',
  'resolution',
  'priority',
  'status_token_hash',
  'submitted_at',
  'updated_at',
  'resolved_at',
  'withdrawn_at',
];
const expectedSubmissionEnums = [
  'submission_event_actor_type',
  'submission_relationship',
  'submission_target_type',
  'submission_type',
];
const submissionFoundationMigrationCreatedAt = 1783607991085;

const sql = neon(databaseUrl);

const tableRows = await sql`
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name = any(${expectedTables})
`;
const presentTables = new Set(tableRows.map((row) => row.table_name));
const tables = Object.fromEntries(expectedTables.map((name) => [name, presentTables.has(name)]));

const columnRows = await sql`
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'submissions'
    and column_name = any(${expectedSubmissionColumns})
`;
const presentColumns = new Set(columnRows.map((row) => row.column_name));
const submissionColumns = Object.fromEntries(
  expectedSubmissionColumns.map((name) => [name, presentColumns.has(name)]),
);

const enumRows = await sql`
  select typname
  from pg_type
  join pg_namespace on pg_namespace.oid = pg_type.typnamespace
  where pg_namespace.nspname = 'public'
    and pg_type.typtype = 'e'
    and typname = any(${expectedSubmissionEnums})
`;
const presentEnums = new Set(enumRows.map((row) => row.typname));
const enums = Object.fromEntries(
  expectedSubmissionEnums.map((name) => [name, presentEnums.has(name)]),
);

const migrationTableRows = await sql`
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'drizzle'
      and table_name = '__cpm_migrations'
  ) as exists
`;
const migrationTableExists = migrationTableRows[0]?.exists === true;
let migrationCount = null;
let submissionFoundationMigrationRecorded = false;
if (migrationTableExists) {
  const migrationRows = await sql`
    select
      count(*)::integer as migration_count,
      coalesce(bool_or(created_at = ${submissionFoundationMigrationCreatedAt}), false) as foundation_recorded
    from drizzle.__cpm_migrations
  `;
  migrationCount = migrationRows[0]?.migration_count ?? null;
  submissionFoundationMigrationRecorded = migrationRows[0]?.foundation_recorded === true;
}

const ready =
  Object.values(tables).every(Boolean) &&
  Object.values(submissionColumns).every(Boolean) &&
  Object.values(enums).every(Boolean) &&
  migrationTableExists &&
  submissionFoundationMigrationRecorded;

console.log(
  JSON.stringify(
    {
      status: ready ? 'ready' : 'schema_drift',
      tables,
      submissionColumns,
      enums,
      migrationLedger: {
        tableExists: migrationTableExists,
        migrationCount,
        submissionFoundationMigrationRecorded,
      },
    },
    null,
    2,
  ),
);

if (!ready) process.exitCode = 1;
