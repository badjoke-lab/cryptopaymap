from pathlib import Path

executor = Path('scripts/run-ops-p6-002a-configured-staging-p6-07-isolated-restore.mjs')
s = executor.read_text()
anchor = '''function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error('unsafe_identifier');
  return `"${value}"`;
}

'''
assert anchor in s
helper = r'''function normalizePostgresConstraintDefinition(value) {
  const constantVarcharArrayToTextArray =
    /ARRAY\[((?:'(?:''|[^'])*'::character varying)(?:, '(?:''|[^'])*'::character varying)*)\]::text\[\]/g;
  return value.replace(constantVarcharArrayToTextArray, (_, entries) => {
    const normalizedEntries = entries.replace(
      /::character varying(?=,|$)/g,
      '::character varying::text',
    );
    return `ARRAY[${normalizedEntries}]`;
  });
}

function normalizeConstraintCatalogRows(value) {
  if (value.length === 0) return value;
  return value
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      if (row[3] === 'c' && typeof row[5] === 'string') {
        row[5] = normalizePostgresConstraintDefinition(row[5]);
      }
      return JSON.stringify(row);
    })
    .join('\n');
}

'''
s = s.replace(anchor, anchor + helper, 1)
old = '''      const constraints = runPsql(
        databaseUrl,
        `select jsonb_build_array(n.nspname,t.relname,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid,true))::text from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in ${scope} order by n.nspname,t.relname,c.conname`,
      );'''
new = '''      const constraints = normalizeConstraintCatalogRows(
        runPsql(
          databaseUrl,
          `select jsonb_build_array(n.nspname,t.relname,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid,true))::text from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname in ${scope} order by n.nspname,t.relname,c.conname`,
        ),
      );'''
assert old in s
s = s.replace(old, new, 1)
anchor = '''async function selfTest() {
  if (!sameSortedValues(applicationSchemaNames, ['public', 'drizzle'])) {
    throw new Error('application_schema_scope_self_test_failed');
  }
'''
assert anchor in s
addition = '''async function selfTest() {
  if (!sameSortedValues(applicationSchemaNames, ['public', 'drizzle'])) {
    throw new Error('application_schema_scope_self_test_failed');
  }
  const sourceConstraint =
    "CHECK (storage_scope <> 'public'::media_storage_scope OR variant <> 'original'::media_variant AND (mime_type::text = ANY (ARRAY['image/jpeg'::character varying, 'image/webp'::character varying]::text[])))";
  const restoredConstraint =
    "CHECK (storage_scope <> 'public'::media_storage_scope OR variant <> 'original'::media_variant AND (mime_type::text = ANY (ARRAY['image/jpeg'::character varying::text, 'image/webp'::character varying::text])))";
  if (
    normalizePostgresConstraintDefinition(sourceConstraint) !==
    normalizePostgresConstraintDefinition(restoredConstraint)
  ) {
    throw new Error('equivalent_constraint_deparser_form_self_test_failed');
  }
  const changedConstraint = restoredConstraint.replace('image/webp', 'image/png');
  if (
    normalizePostgresConstraintDefinition(sourceConstraint) ===
    normalizePostgresConstraintDefinition(changedConstraint)
  ) {
    throw new Error('substantive_constraint_change_self_test_failed');
  }
'''
s = s.replace(anchor, addition, 1)
executor.write_text(s)

checker = Path('scripts/check-ops-p6-002a-configured-staging-p6-07-isolated-restore.mjs')
s = checker.read_text()
anchor = "  [files.executor, 'pg_get_constraintdef(c.oid,true)'],\n"
assert anchor in s
s = s.replace(
    anchor,
    anchor
    + "  [files.executor, 'normalizePostgresConstraintDefinition'],\n"
    + "  [files.executor, 'constantVarcharArrayToTextArray'],\n"
    + "  [files.executor, 'normalizeConstraintCatalogRows'],\n"
    + "  [files.executor, \"throw new Error('equivalent_constraint_deparser_form_self_test_failed')\"],\n"
    + "  [files.executor, \"throw new Error('substantive_constraint_change_self_test_failed')\"],\n",
    1,
)
checker.write_text(s)

doc = Path('docs/OPS_P6_002A_CONFIGURED_STAGING_P6_07_ISOLATED_RESTORE.md')
s = doc.read_text()
old = 'The executor records only table-set, row-count, constraint, semantic application-schema, and invariant digests. The semantic schema digest is derived from PostgreSQL catalogs for `public` and `drizzle`; it excludes environment-sensitive raw whole-database dump text, ownership, privileges, and connection identity. It does not retain row values, private payloads, contacts, credentials, database URLs, or unrestricted logs.'
assert old in s
new = old + '\n\nPostgreSQL can deparse an equivalent constant `character varying` array cast to `text[]` after dump/restore either as a whole-array `::text[]` cast or as redundant per-element `::text` casts. Before hashing CHECK-constraint catalog rows, Q4 canonicalizes only that narrow constant-array cast representation. Constraint identity, type, validation state, all other expression text, and any substantive value or predicate change remain exact and fail closed.'
s = s.replace(old, new, 1)
doc.write_text(s)
