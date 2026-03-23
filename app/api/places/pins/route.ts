import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError } from "@/lib/db";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import { listPlacesForMap } from "@/lib/places/listPlacesForMap";

const DEFAULT_LIMIT = 12000;
const MAX_LIMIT = 12000;
const CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=300";
const NO_STORE = "no-store";

type MarkerPin = {
  id: string;
  lat: number;
  lng: number;
  verification: string;
};

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseSearchTerm = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson } = getDataSourceContext(dataSource);
  const defaultSource = dataSource === "json" ? "json" : dataSource === "db" ? "db" : shouldAttemptDb ? "db" : "json";
  const defaultHeaders = buildDataSourceHeaders(defaultSource, defaultSource === "json");

  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const chainFilters = searchParams.getAll("chain").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const paymentFilters = searchParams.getAll("payment").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);

  const filters = {
    asset: normalizeAcceptsAsset(searchParams.get("asset")),
    category: searchParams.get("category"),
    country: searchParams.get("country"),
    city: searchParams.get("city"),
    bbox: null,
    verification: searchParams
      .getAll("verification")
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean) as ("owner" | "community" | "directory" | "unverified")[],
    payment: Array.from(new Set([...chainFilters, ...paymentFilters])).map((v) => v.toLowerCase()),
    search: parseSearchTerm(searchParams.get("q")),
    limit,
    offset: 0,
  };

  try {
    const result = await withDbTimeout(
      listPlacesForMap({
        dataSource: dataSource === "auto" ? "auto" : dataSource,
        filters,
      }),
      { message: "DB_TIMEOUT" },
    );

    const body: MarkerPin[] = result.places.map((place) => ({
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      verification: place.verification,
    }));

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        ...buildDataSourceHeaders(result.source, result.limited),
        ...(result.lastUpdatedISO ? { "x-cpm-last-updated": result.lastUpdatedISO } : {}),
      },
    });
  } catch (error) {
    if (!shouldAllowJson || dataSource === "db" || error instanceof DbUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": NO_STORE, ...defaultHeaders } },
      );
    }

    return NextResponse.json(
      { ok: false, error: "FALLBACK_SNAPSHOT_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("json", true) } },
    );
  }
}
