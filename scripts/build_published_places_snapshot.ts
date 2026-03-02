import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { listPlacesForMap } from "@/lib/places/listPlacesForMap";
import { isLegacyOrDemoId } from "@/lib/places/legacyFilters";

const OUTPUT_PATH = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

type SnapshotPlace = Awaited<ReturnType<typeof listPlacesForMap>>["places"][number] & {
  is_demo?: boolean | null;
};

type Snapshot = {
  meta: {
    last_updated: string;
    source: "db";
    notes: string;
  };
  places: Awaited<ReturnType<typeof listPlacesForMap>>["places"];
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[build_published_places_snapshot] DATABASE_URL is required.");
    process.exitCode = 1;
    return;
  }

  const result = await listPlacesForMap({
    dataSource: "db",
    filters: {
      category: null,
      country: null,
      city: null,
      bbox: null,
      verification: [],
      payment: [],
      search: null,
      limit: 5000,
      offset: 0,
    },
  });

  const places = result.places.filter((place) => !isLegacyOrDemoId(place.id) && !(place as SnapshotPlace).is_demo);

  const snapshot: Snapshot = {
    meta: {
      last_updated: new Date().toISOString(),
      source: "db",
      notes: "approved/published snapshot for map fallback",
    },
    places,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log("[build_published_places_snapshot] wrote snapshot", {
    output: OUTPUT_PATH,
    count: places.length,
    last_updated: snapshot.meta.last_updated,
  });
}

main().catch((error) => {
  console.error("[build_published_places_snapshot] failed", error);
  process.exitCode = 1;
});
