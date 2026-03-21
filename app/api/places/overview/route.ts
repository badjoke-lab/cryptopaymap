import { NextRequest, NextResponse } from "next/server";

import { parseBbox } from "@/lib/geo/bbox";
import { DbUnavailableError } from "@/lib/db";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import { listPlacesOverviewForMap } from "@/lib/places/listPlacesOverviewForMap";

const CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=120";
const NO_STORE = "no-store";

const parseSearchTerm = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
};

const parseZoom = (value: string | null): number => {
  if (!value) return 2;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(0, Math.min(parsed, 22));
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const bboxResult = parseBbox(searchParams.get("bbox"));

  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson } = getDataSourceContext(dataSource);
  const defaultSource = dataSource === "json" ? "json" : dataSource === "db" ? "db" : shouldAttemptDb ? "db" : "json";
  const defaultHeaders = buildDataSourceHeaders(defaultSource, defaultSource === "json");

  if (bboxResult.error) {
    return NextResponse.json(
      { ok: false, error: "INVALID_BBOX", message: bboxResult.error },
      { status: 400, headers: { "Cache-Control": NO_STORE, ...defaultHeaders } },
    );
  }

  const chainFilters = searchParams.getAll("chain").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
  const paymentFilters = searchParams.getAll("payment").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);

  const filters = {
    asset: normalizeAcceptsAsset(searchParams.get("asset")),
    category: searchParams.get("category"),
    country: searchParams.get("country"),
    city: searchParams.get("city"),
    bbox: bboxResult.bbox,
    verification: searchParams.getAll("verification").flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean) as ("owner" | "community" | "directory" | "unverified")[],
    payment: Array.from(new Set([...chainFilters, ...paymentFilters])).map((v) => v.toLowerCase()),
    search: parseSearchTerm(searchParams.get("q")),
    zoom: parseZoom(searchParams.get("zoom")),
  };

  try {
    const result = await withDbTimeout(
      listPlacesOverviewForMap({
        dataSource: dataSource === "auto" ? "auto" : dataSource,
        filters,
      }),
      { message: "DB_TIMEOUT" },
    );

    return NextResponse.json(
      {
        clusters: result.clusters,
        totalPlaces: result.totalPlaces,
        cellSizeDeg: result.cellSizeDeg,
      },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          ...buildDataSourceHeaders(result.source, result.limited),
          ...(result.lastUpdatedISO ? { "x-cpm-last-updated": result.lastUpdatedISO } : {}),
        },
      },
    );
  } catch (error) {
    if (!shouldAllowJson || dataSource === "db") {
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) } },
      );
    }
    if (error instanceof DbUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "DB_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) } },
      );
    }
    return NextResponse.json(
      { ok: false, error: "FALLBACK_SNAPSHOT_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("json", true) } },
    );
  }
}
