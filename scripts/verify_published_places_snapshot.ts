import { readFile } from "node:fs/promises";
import path from "node:path";

import { isAntarcticaDemoId, LEGACY_TEST_IDS } from "@/lib/places/legacyFilters";

type SnapshotPlace = Record<string, unknown>;

type Snapshot = {
  places?: SnapshotPlace[];
};

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

const REQUIRED_KEYS = [
  "id",
  "name",
  "lat",
  "lng",
  "verification",
  "category",
  "city",
  "country",
  "accepted",
  "address_full",
  "about_short",
  "paymentNote",
  "amenities",
  "phone",
  "website",
  "twitter",
  "instagram",
  "facebook",
  "coverImage",
] as const;

async function main() {
  const raw = await readFile(SNAPSHOT_PATH, "utf8");
  const parsed = JSON.parse(raw) as Snapshot;
  const places = Array.isArray(parsed.places) ? parsed.places : [];

  const flaggedIds: string[] = [];
  const missingKeyIds: Array<{ id: string; missing: string[] }> = [];

  for (const place of places) {
    const id = typeof place.id === "string" ? place.id : "";
    if (id && (LEGACY_TEST_IDS.has(id) || isAntarcticaDemoId(id))) {
      flaggedIds.push(id);
    }

    const missing = REQUIRED_KEYS.filter((key) => !(key in place));
    if (missing.length) {
      missingKeyIds.push({ id: id || "<unknown>", missing: [...missing] });
    }
  }

  if (flaggedIds.length > 0 || missingKeyIds.length > 0) {
    console.error("[verify_published_places_snapshot] FAILED", {
      snapshot: SNAPSHOT_PATH,
      total_places: places.length,
      flagged_ids: flaggedIds,
      missing_required_keys: missingKeyIds,
    });
    process.exitCode = 1;
    return;
  }

  console.log("[verify_published_places_snapshot] PASS", {
    snapshot: SNAPSHOT_PATH,
    total_places: places.length,
    flagged_ids: 0,
    missing_required_keys: 0,
  });
}

main().catch((error) => {
  console.error("[verify_published_places_snapshot] FAILED", error);
  process.exitCode = 1;
});
