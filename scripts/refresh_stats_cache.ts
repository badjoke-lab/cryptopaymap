import { dbQuery, hasDatabaseUrl } from "@/lib/db";
import { loadUnfilteredStatsFromDb, type StatsApiResponse } from "@/app/api/stats/route";

const ROUTE = "scripts_refresh_stats_cache";
const CACHE_KEY = "global_unfiltered";

const resolveAsOf = (payload: StatsApiResponse) => {
  const candidate = payload.meta?.as_of;
  if (!candidate) return new Date().toISOString();

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

async function main() {
  if (!hasDatabaseUrl()) {
    console.error("Missing DATABASE_URL environment variable");
    process.exit(1);
  }

  const payload = await loadUnfilteredStatsFromDb(ROUTE);
  const asOf = resolveAsOf(payload);

  await dbQuery(
    `INSERT INTO stats_cache (cache_key, payload, as_of, updated_at)
     VALUES ($1, $2::jsonb, $3::timestamptz, NOW())
     ON CONFLICT (cache_key)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       as_of = EXCLUDED.as_of,
       updated_at = NOW()`,
    [CACHE_KEY, JSON.stringify(payload), asOf],
    { route: ROUTE },
  );

  console.log("[refresh_stats_cache] done", {
    cacheKey: CACHE_KEY,
    asOf,
    totalPlaces: payload.total_places,
    source: payload.meta?.source ?? "db_live",
  });
}

main().catch((error) => {
  console.error("[refresh_stats_cache] failed", error);
  process.exit(1);
});
