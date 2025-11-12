// scripts/gen-stats.ts
// DBから簡易統計を生成し、public/stats/summary.json に書き出す

import { Pool } from "pg";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL });

async function q<T=any>(sql: string, params?: any[]): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

async function main() {
  const total = await q<{ count: number }>(`SELECT COUNT(*)::int AS count FROM places`);
  const byCountry = await q(`SELECT country, COUNT(*)::int AS count FROM places GROUP BY country ORDER BY count DESC NULLS LAST`);
  const byCity = await q(`SELECT country, city, COUNT(*)::int AS count FROM places GROUP BY country, city ORDER BY count DESC NULLS LAST`);
  const byCategory = await q(`SELECT category, COUNT(*)::int AS count FROM places GROUP BY category ORDER BY count DESC NULLS LAST`);
  const byVerification = await q(`
    SELECT v.level, COUNT(*)::int AS count
    FROM verifications v
    GROUP BY v.level
    ORDER BY count DESC
  `);

  const out = {
    generated_at: new Date().toISOString(),
    totals: { places: total[0]?.count ?? 0 },
    by_country: byCountry,
    by_city: byCity,
    by_category: byCategory,
    by_verification: byVerification,
  };

  const outPath = "public/stats/summary.json";
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf-8");
  console.log(`wrote ${outPath}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
