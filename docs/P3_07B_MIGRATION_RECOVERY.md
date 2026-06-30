# P3-07B migration recovery

P3-07B adds migration `0014_clean_stardust` for the private Candidate promotion audit table.

## Committed migration set

- `drizzle/0014_clean_stardust.sql`
- `drizzle/meta/_journal.json`
- `drizzle/snapshot-artifacts/0014_snapshot.json.gz`

The canonical snapshot is stored outside `drizzle/meta` as a deterministic gzip artifact. It is materialized into `drizzle/meta` before every Drizzle generate, check, or migrate command. Keeping the compressed artifact outside `drizzle/meta` prevents Drizzle Kit from attempting to parse it as JSON.

## Integrity boundary

The materializer verifies the uncompressed snapshot against this SHA-256 digest before writing it:

```text
ceabb777cc98f01fa6b129a00e8b2c931d25f02806aeb559a18c6d8be1fbf951
```

A missing compressed artifact, decompression failure, invalid JSON document, or digest mismatch fails the database command before Drizzle runs.

## Generated working file

`drizzle/meta/0014_snapshot.json` is a generated working file and is intentionally ignored. Do not edit it directly. To restore it, run:

```text
npm run db:snapshot:materialize
```

The compressed canonical artifact and its expected digest must only change through a reviewed migration update.
