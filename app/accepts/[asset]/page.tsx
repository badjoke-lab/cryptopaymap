import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAcceptsAssetLabel, normalizeAcceptsAsset } from "@/lib/acceptsAsset";
import { getDataSourceSetting } from "@/lib/dataSource";
import { listPlacesForMap } from "@/lib/places/listPlacesForMap";
import { buildPageMetadata } from "@/lib/seo/metadata";

type AcceptsAssetPageProps = {
  params: { asset: string };
};

const MAX_RESULTS = 200;

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

export default async function AcceptsAssetPage({ params }: AcceptsAssetPageProps) {
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">Places accepting {asset}</h1>
      <p className="mt-3 text-base text-gray-700">
        Browse businesses that accept {assetLabel} payments.
      </p>
      <div className="mt-5">
        <Link
          href={`/map?asset=${encodeURIComponent(asset)}`}
          className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Open Map
        </Link>
      </div>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Found {result.places.length} places</h2>
        {result.places.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No places found for this asset yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {result.places.map((place) => (
              <li key={place.id}>
                <Link href={`/place/${encodeURIComponent(place.id)}`} className="text-sky-700 hover:underline">
                  {place.name}
                </Link>
                <span className="ml-2 text-sm text-gray-500">
                  {[place.city, place.country].filter(Boolean).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
