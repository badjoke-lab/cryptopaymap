# CryptoPayMap database foundation

## Purpose

P1-06 establishes shared runtime validation, PostgreSQL schema placement, a Neon-compatible database factory, and reviewable SQL migrations. Domain tables remain owned by later phases.

## Ownership

```text
Neon PostgreSQL
Canonical operational and history data

Drizzle schema
Typed PostgreSQL structures

Drizzle migrations
Reviewed SQL changes

Zod schemas
Runtime validation

Public JSON
Validated public snapshots
```

The public static build does not connect to PostgreSQL.

## Files

```text
drizzle.config.ts
src/db/client.ts
src/db/schema/enums.ts
src/db/schema/index.ts
src/schemas/core.ts
src/schemas/environment.ts
scripts/check-runtime-schemas.ts
drizzle/
```

## Commands

```bash
npm run schema:check
npm run db:generate
npm run db:check
npm run db:migrate
```

`schema:check` runs representative Zod validations.

`db:generate` creates SQL and Drizzle metadata from the TypeScript schema.

`db:check` checks committed migration history.

`db:migrate` applies committed migrations in an explicitly configured server environment. It is not part of the public static build.

## Connection rule

`src/db/client.ts` exports an explicit factory. Importing a public component does not open a database connection. Protected server code supplies a validated PostgreSQL URL when a connection is needed.

`DATABASE_URL` is server-only. The public build intentionally succeeds when it is absent.

## Migration rules

- commit generated SQL;
- review generated SQL before merge;
- keep schema and migration changes in the same pull request;
- generate and apply migrations as separate operations;
- avoid direct production schema edits as the normal workflow;
- document data-preservation and rollback effects for destructive changes;
- identify public-export compatibility effects;
- keep connection values out of committed files and generated output.

## Foundational enums

P1-06 introduces structural values already fixed by the product contract:

- acceptance-claim status;
- claim visibility;
- route type;
- submission workflow status;
- submission resolution.

Asset, network, payment-method, category, and processor registries remain extensible tables or versioned registries in later phases.

## Runtime validation

The initial Zod contract covers:

- public slugs;
- country codes;
- date-only values;
- HTTPS source URLs;
- claim status and visibility;
- route type;
- submission workflow and resolution;
- payment-method identifiers;
- public sample data;
- optional and required database environment shapes.

External values are parsed before use. TypeScript casts are not treated as runtime validation.

## Public-build isolation

- `npm run build` succeeds without database configuration;
- public pages do not import the database client;
- ordinary public viewing uses generated data;
- generated data is validated before publication;
- protected server paths own write operations;
- non-public records and review fields remain outside public exports.

## Later phases

Phase 2 adds domain tables, relations, indexes, registries, imports, and export schemas.

Phase 3 adds review transactions and audit queries.

Phase 5 adds submission and media workflow data.
