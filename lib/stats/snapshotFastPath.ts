import { dbQuery } from "@/lib/db";

import type { StatsApiResponse } from "@/app/api/stats/route";

type SnapshotSourceRow = {
  payload: unknown;
};

const SNAPSHOT_TABLE_CANDIDATES = [
  { table: "stats_cache", payloadColumn: "payload", timestampColumn: "as_of" },
  { table: "stats_snapshot", payloadColumn: "payload", timestampColumn: "as_of" },
  { table: "stats_snapshots", payloadColumn: "payload", timestampColumn: "as_of" },
] as const;

const quoteIdentifier = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    "SELECT to_regclass($1) AS present",
    [`public.${table}`],
    { route },
  );
  return Boolean(rows[0]?.present);
};

const hasColumn = async (route: string, table: string, column: string) => {
  const { rows } = await dbQuery<{ present: number }>(
    `SELECT COUNT(*)::int AS present
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [table, column],
    { route },
  );
  return (rows[0]?.present ?? 0) > 0;
};

const isStatsApiResponse = (value: unknown): value is StatsApiResponse => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.total_places === "number" &&
    typeof candidate.total_count === "number" &&
    typeof candidate.countries === "number" &&
    typeof candidate.cities === "number" &&
    typeof candidate.categories === "number" &&
    typeof candidate.accepting_any_count === "number"
  );
};

export const loadUnfilteredStatsSnapshotFastPath = async (
  route: string,
): Promise<StatsApiResponse | null> => {
  for (const candidate of SNAPSHOT_TABLE_CANDIDATES) {
    const exists = await tableExists(route, candidate.table);
    if (!exists) continue;

    const [hasPayload, hasTimestamp] = await Promise.all([
      hasColumn(route, candidate.table, candidate.payloadColumn),
      hasColumn(route, candidate.table, candidate.timestampColumn),
    ]);

    if (!hasPayload || !hasTimestamp) continue;

    const payloadSql = quoteIdentifier(candidate.payloadColumn);
    const timestampSql = quoteIdentifier(candidate.timestampColumn);
    const tableSql = quoteIdentifier(candidate.table);

    const { rows } = await dbQuery<SnapshotSourceRow>(
      `SELECT ${payloadSql} AS payload
       FROM ${tableSql}
       ORDER BY ${timestampSql} DESC
       LIMIT 1`,
      [],
      { route },
    );

    const payload = rows[0]?.payload;
    if (isStatsApiResponse(payload)) {
      return payload;
    }
  }

  return null;
};
