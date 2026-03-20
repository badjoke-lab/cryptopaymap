import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeAccepted } from "@/lib/accepted";
import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import type { ParsedBbox } from "@/lib/geo/bbox";
import { places as fallbackPlaces } from "@/lib/data/places";
import { getMapDisplayableWhereClauses, isMapDisplayablePlace } from "@/lib/stats/mapPopulation";
import type { Place } from "@/types/places";

import { isLegacyOrDemoId, LEGACY_TEST_IDS } from "./legacyFilters";

type PublishedSnapshot = {
  meta?: { last_updated?: string };
  places: Place[];
};

const FALLBACK_SNAPSHOT_FILE = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

export type ListPlacesOverviewFilters = {
  asset: string | null;
  category: string | null;
  country: string | null;
  city: string | null;
  bbox: ParsedBbox[] | null;
  verification: Place["verification"][];
  payment: string[];
  search: string | null;
  zoom: number;
};

export type OverviewCluster = {
  id: string;
  lat: number;
  lng: number;
  count: number;
};

export type ListPlacesOverviewResult = {
  clusters: OverviewCluster[];
  totalPlaces: number;
  cellSizeDeg: number;
  source: "db" | "json";
  limited: boolean;
  lastUpdatedISO?: string;
};

const normalizeText = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const getCellSizeDeg = (zoom: number): number => {
  if (zoom <= 1) return 12;
  if (zoom <= 2) return 6;
  if (zoom <= 3) return 3;
  return 1.5;
};

const aggregateToGrid = (points: Array<{ id: string; lat: number; lng: number }>, cellSizeDeg: number): OverviewCluster[] => {
  const buckets = new Map<string, { count: number; latSum: number; lngSum: number }>();

  points.forEach((point) => {
    const cellLng = Math.floor((point.lng + 180) / cellSizeDeg);
    const cellLat = Math.floor((point.lat + 90) / cellSizeDeg);
    const key = `${cellLng}:${cellLat}`;
    const current = buckets.get(key) ?? { count: 0, latSum: 0, lngSum: 0 };
    current.count += 1;
    current.latSum += point.lat;
    current.lngSum += point.lng;
    buckets.set(key, current);
  });

  return Array.from(buckets.entries())
    .map(([key, value]) => ({
      id: `grid:${key}`,
      lat: Number((value.latSum / value.count).toFixed(6)),
      lng: Number((value.lngSum / value.count).toFixed(6)),
      count: value.count,
    }))
    .sort((a, b) => b.count - a.count);
};

const loadPlacesFromSnapshot = async (): Promise<PublishedSnapshot> => {
  const raw = await fs.readFile(FALLBACK_SNAPSHOT_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as PublishedSnapshot).places)) {
    return parsed as PublishedSnapshot;
  }
  throw new Error("FALLBACK_SNAPSHOT_UNAVAILABLE");
};

const loadOverviewPointsFromDb = async (
  filters: ListPlacesOverviewFilters,
): Promise<{ points: Array<{ id: string; lat: number; lng: number }>; total: number } | null> => {
  if (!hasDatabaseUrl()) return null;

  const route = "api_places_overview";

  const { rows: tableChecks } = await dbQuery<{ present: string | null; verifications: string | null; payments: string | null }>(
    `SELECT
      to_regclass('public.places') AS present,
      to_regclass('public.verifications') AS verifications,
      to_regclass('public.payment_accepts') AS payments`,
    [],
    { route },
  );
  if (!tableChecks[0]?.present) return null;

  const { rows: placeColumns } = await dbQuery<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='places'
       AND column_name IN ('geom','status','is_demo','address')`,
    [],
    { route },
  );
  const hasCol = (name: string) => placeColumns.some((r) => r.column_name === name);

  const where: string[] = [...getMapDisplayableWhereClauses("p")];
  const paramsWhere: unknown[] = [];

  if (filters.category) {
    paramsWhere.push(filters.category);
    where.push(`p.category = $${paramsWhere.length}`);
  }
  if (filters.country) {
    paramsWhere.push(filters.country);
    where.push(`p.country = $${paramsWhere.length}`);
  }
  if (filters.city) {
    paramsWhere.push(filters.city);
    where.push(`p.city = $${paramsWhere.length}`);
  }
  if (hasCol("status")) where.push("COALESCE(p.status, 'published') = 'published'");
  if (hasCol("is_demo")) where.push("COALESCE(p.is_demo, false) = false");

  paramsWhere.push(Array.from(LEGACY_TEST_IDS));
  where.push(`NOT (p.id = ANY($${paramsWhere.length}::text[]))`);

  const hasVerifications = Boolean(tableChecks[0]?.verifications);
  const hasPayments = Boolean(tableChecks[0]?.payments);
  let verificationField: string | null = null;
  if (hasVerifications) {
    const { rows: verificationColumns } = await dbQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='verifications' AND column_name IN ('level')`,
      [],
      { route },
    );
    if (verificationColumns.some((row) => row.column_name === "level")) verificationField = "v.level";
  }

  if (filters.bbox?.length) {
    const useGeom = hasCol("geom");
    const clauses: string[] = [];
    for (const bbox of filters.bbox) {
      const start = paramsWhere.length + 1;
      if (useGeom) {
        paramsWhere.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
        clauses.push(`ST_Intersects(p.geom::geometry, ST_MakeEnvelope($${start}, $${start + 1}, $${start + 2}, $${start + 3}, 4326))`);
      } else {
        paramsWhere.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
        clauses.push(`(p.lng BETWEEN $${start} AND $${start + 1} AND p.lat BETWEEN $${start + 2} AND $${start + 3})`);
      }
    }
    where.push(clauses.length > 1 ? `(${clauses.join(" OR ")})` : clauses[0]);
  }

  if (filters.search) {
    paramsWhere.push(`%${filters.search}%`);
    where.push(`(p.name ILIKE $${paramsWhere.length} OR COALESCE(p.address, '') ILIKE $${paramsWhere.length})`);
  }

  if (filters.verification.length) {
    if (!verificationField) {
      if (!filters.verification.every((v) => v === "unverified")) return { points: [], total: 0 };
    } else {
      paramsWhere.push(filters.verification);
      where.push(`COALESCE(${verificationField}, 'unverified') = ANY($${paramsWhere.length}::text[])`);
    }
  }

  if (filters.asset) {
    if (!hasPayments) return { points: [], total: 0 };
    paramsWhere.push(filters.asset);
    where.push(`EXISTS (SELECT 1 FROM payment_accepts pa WHERE pa.place_id = p.id AND UPPER(COALESCE(pa.asset, '')) = $${paramsWhere.length})`);
  }

  if (filters.payment.length) {
    if (!hasPayments) return { points: [], total: 0 };
    paramsWhere.push(filters.payment);
    where.push(`EXISTS (SELECT 1 FROM payment_accepts pa WHERE pa.place_id = p.id AND (LOWER(pa.asset) = ANY($${paramsWhere.length}::text[]) OR LOWER(pa.chain) = ANY($${paramsWhere.length}::text[])))`);
  }

  const joinVerification = verificationField ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countResult, placesResult] = await Promise.all([
    dbQuery<{ total: number }>(
      `SELECT COUNT(DISTINCT p.id)::int AS total
       FROM places p${joinVerification}
       ${whereClause}`,
      paramsWhere,
      { route },
    ),
    dbQuery<{ id: string; lat: number; lng: number }>(
      `SELECT p.id, p.lat, p.lng
       FROM places p${joinVerification}
       ${whereClause}`,
      paramsWhere,
      { route },
    ),
  ]);

  const total = Number(countResult.rows[0]?.total ?? 0);
  const points = placesResult.rows.map((row) => ({ id: row.id, lat: Number(row.lat), lng: Number(row.lng) }));

  return { points, total };
};

export async function listPlacesOverviewForMap(options: {
  dataSource: "db" | "json" | "auto";
  filters: ListPlacesOverviewFilters;
}): Promise<ListPlacesOverviewResult> {
  const cellSizeDeg = getCellSizeDeg(options.filters.zoom);

  if (options.dataSource !== "json") {
    try {
      const dbResult = await loadOverviewPointsFromDb(options.filters);
      if (dbResult) {
        return {
          clusters: aggregateToGrid(dbResult.points, cellSizeDeg),
          totalPlaces: dbResult.total,
          cellSizeDeg,
          source: "db",
          limited: false,
        };
      }
    } catch (error) {
      if (options.dataSource === "db") throw error;
      if (!(error instanceof DbUnavailableError)) {
        console.warn("[places-overview] failed to load from database", error);
      }
    }

    if (options.dataSource === "db") {
      throw new Error("DB_UNAVAILABLE");
    }
  }

  const snapshot = await loadPlacesFromSnapshot();
  const filtered = snapshot.places
    .filter((place) => !isLegacyOrDemoId(place.id))
    .filter((place) => isMapDisplayablePlace(place))
    .filter((place) => (options.filters.category ? place.category === options.filters.category : true))
    .filter((place) => (options.filters.country ? place.country === options.filters.country : true))
    .filter((place) => (options.filters.city ? place.city === options.filters.city : true))
    .filter((place) => (options.filters.verification.length ? options.filters.verification.includes(place.verification) : true))
    .filter((place) => {
      if (!options.filters.asset) return true;
      const accepted = normalizeAccepted([], place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? []);
      return accepted.some((entry) => entry === options.filters.asset || entry.startsWith(`${options.filters.asset}@`));
    })
    .filter((place) => {
      if (!options.filters.payment.length) return true;
      const chains = (place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? []).map((item) => item.toLowerCase());
      return options.filters.payment.some((chain) => chains.includes(chain));
    })
    .filter((place) => {
      if (!options.filters.bbox?.length) return true;
      return options.filters.bbox.some(({ minLng, minLat, maxLng, maxLat }) =>
        place.lng >= minLng && place.lng <= maxLng && place.lat >= minLat && place.lat <= maxLat,
      );
    })
    .filter((place) => {
      if (!options.filters.search) return true;
      const target = `${place.name ?? ""} ${place.address ?? ""}`.toLowerCase();
      return target.includes(options.filters.search.toLowerCase());
    });

  const points = filtered.map((place) => ({ id: place.id, lat: place.lat, lng: place.lng }));

  return {
    clusters: aggregateToGrid(points, cellSizeDeg),
    totalPlaces: filtered.length,
    cellSizeDeg,
    source: "json",
    limited: true,
    lastUpdatedISO: normalizeText(snapshot.meta?.last_updated) ?? undefined,
  };
}
