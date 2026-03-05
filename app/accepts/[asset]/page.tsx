import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAcceptsAssetLabel, normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import { getDataSourceSetting } from "@/lib/dataSource";
import { listPlacesForMap } from "@/lib/places/listPlacesForMap";
import { buildPageMetadata } from "@/lib/seo/metadata";

type AcceptsAssetPageProps = {
  params: { asset: string };
  searchParams?: { country?: string };
};

const MAX_RESULTS = 50;

export async function generateMetadata({ params }: AcceptsAssetPageProps): Promise<Metadata> {
  const asset = normalizeAcceptsAsset(params.asset);
  if (!asset) {
    return buildPageMetadata({
      title: "Places accepting crypto",
      description: "Browse places by accepted crypto assets.",
      path: "/accepts",
    });
  }

  const assetLabel = getAcceptsAssetLabel(asset);
  return buildPageMetadata({
    title: `Places accepting ${assetLabel} (${asset})`,
    description: `Explore businesses that accept ${asset}.`,
    path: `/accepts/${encodeURIComponent(params.asset)}`,
  });
}

const verificationMeta = {
  owner: { label: "Owner", className: "bg-emerald-100 text-emerald-800" },
  community: { label: "Community", className: "bg-sky-100 text-sky-800" },
  directory: { label: "Community", className: "bg-sky-100 text-sky-800" },
  unverified: { label: "Unverified", className: "bg-gray-100 text-gray-700" },
} as const;

const verificationRank: Record<keyof typeof verificationMeta, number> = {
  owner: 0,
  community: 1,
  directory: 1,
  unverified: 2,
};

export default async function AcceptsAssetPage({ params, searchParams }: AcceptsAssetPageProps) {
  const asset = normalizeAcceptsAsset(params.asset);
  if (!asset) notFound();

  const dataSource = getDataSourceSetting();
  const result = await listPlacesForMap({
    dataSource: dataSource === "auto" ? "auto" : dataSource,
    filters: {
      asset,
      category: null,
      country: null,
      city: null,
      bbox: null,
      verification: [],
      payment: [],
      search: null,
      limit: MAX_RESULTS,
      offset: 0,
    },
  });

  const assetLabel = getAcceptsAssetLabel(asset);
  const countries = Array.from(new Set(result.places.map((place) => place.country).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const countryFilter = (searchParams?.country ?? "").trim().toUpperCase();

  const sortedPlaces = [...result.places].sort((a, b) => {
    const byVerification = verificationRank[a.verification] - verificationRank[b.verification];
    if (byVerification !== 0) return byVerification;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });

  const visiblePlaces = countryFilter
    ? sortedPlaces.filter((place) => place.country.toUpperCase() === countryFilter)
    : sortedPlaces;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Places accepting {assetLabel} ({asset})</h1>
      <p className="mt-3 text-base text-gray-700">Browse businesses that accept {assetLabel} payments.</p>
      <div className="mt-5">
        <Link
          href={`/map?asset=${encodeURIComponent(asset)}`}
          className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Open Map
        </Link>
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Total: {result.total} places · Showing first {MAX_RESULTS}</h2>
        <form className="mt-4">
          <label htmlFor="country" className="text-sm font-medium text-gray-700">Country</label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="country"
              name="country"
              defaultValue={countryFilter}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
            >
              <option value="">All countries</option>
              {countries.map((country) => (
                <option key={country} value={country.toUpperCase()}>{country.toUpperCase()}</option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Apply
            </button>
          </div>
        </form>

        {visiblePlaces.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No places found for this asset yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {visiblePlaces.map((place) => (
              <li key={place.id} className="rounded-lg border border-gray-200 p-4">
                <Link href={`/place/${encodeURIComponent(place.id)}`} className="text-base font-semibold text-sky-700 hover:underline">
                  {place.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span>{place.category || "Unknown category"}</span>
                  <span aria-hidden="true">/</span>
                  <span>{[place.city, place.country].filter(Boolean).join(", ") || "Location unknown"}</span>
                  <span aria-hidden="true">/</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${verificationMeta[place.verification].className}`}>
                    {verificationMeta[place.verification].label}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-gray-100 pt-4">
          <Link
            href={`/map?asset=${encodeURIComponent(asset)}`}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            View all on map
          </Link>
        </div>
      </section>
    </main>
  );
}
