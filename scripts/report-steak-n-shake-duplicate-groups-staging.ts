import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { sourceCandidates } from '../src/db/schema';

declare const process: { env: Record<string, string | undefined> };
const TARGET = 'fixed-review-staging';

async function main() {
  if (process.env.CPM_CANDIDATE_ACQUISITION_TARGET !== TARGET) throw new Error(`Refusing outside ${TARGET}.`);
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('DATABASE_URL is required.');
  const db = createDatabase(url);
  const rows = await db.select({
    status: sourceCandidates.candidateStatus,
    duplicateGroupId: sourceCandidates.duplicateGroupId,
    canonicalEntityId: sourceCandidates.canonicalEntityId,
    canonicalLocationId: sourceCandidates.canonicalLocationId,
  }).from(sourceCandidates).where(and(
    eq(sourceCandidates.candidateType, 'physical_place'),
    ilike(sourceCandidates.normalizedName, '%steak%n%shake%'),
  ));
  const groups = new Map<string, number>();
  for (const row of rows) if (row.duplicateGroupId) groups.set(row.duplicateGroupId, (groups.get(row.duplicateGroupId) ?? 0) + 1);
  console.log(JSON.stringify({
    target: TARGET,
    total: rows.length,
    withoutDuplicateGroup: rows.filter((r) => !r.duplicateGroupId).length,
    withDuplicateGroup: rows.filter((r) => !!r.duplicateGroupId).length,
    duplicateGroupCount: groups.size,
    duplicateGroupSizes: [...groups.values()].sort((a,b) => b-a),
    canonicalLinked: rows.filter((r) => !!r.canonicalEntityId || !!r.canonicalLocationId).length,
    readOnly: true,
    candidatePayloadExposed: false,
  }));
}
await main();