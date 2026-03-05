import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getPlaceDetail } from '@/lib/places/detail';
import { buildPlaceMetadata } from '@/lib/seo/metadata';
import { safeDecode } from '@/lib/utils/safeDecode';

type PlacePageProps = {
  params: { id: string };
};

type PlaceSummary = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  category?: string | null;
  verification?: 'owner' | 'community' | 'directory' | 'unverified';
};

const formatLocation = (city: string | null | undefined, country: string | null | undefined) => {
  const location = [city, country].map((value) => value?.trim()).filter(Boolean).join(', ');
  return location.length ? location : null;
};

const siteUrl = 'https://www.cryptopaymap.com';
const relatedLinksLimit = 10;
const supportedAssets = ['BTC', 'ETH', 'USDT', 'USDC'] as const;

const verificationPriority: Record<NonNullable<PlaceSummary['verification']>, number> = {
  owner: 0,
  community: 1,
  directory: 2,
  unverified: 3,
};

const toCitySlug = (city: string) =>
  encodeURIComponent(
    city
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
  );

const normalizeAssetToken = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const detectPrimaryAsset = (place: {
  accepted?: string[] | null;
  amenities?: string[] | null;
  paymentNote?: string | null;
}) => {
  for (const entry of place.accepted ?? []) {
    const assetCandidate = entry.split('@')[0] ?? entry;
    const normalized = normalizeAssetToken(assetCandidate);
    if (normalized === 'LIGHTNING' || normalized === 'LN') continue;
    if (supportedAssets.includes(normalized as (typeof supportedAssets)[number])) {
      return normalized;
    }
  }

  const searchable = [...(place.amenities ?? []), place.paymentNote ?? ''].join(' ').toUpperCase();
  for (const asset of supportedAssets) {
    const regex = new RegExp(`\\b${asset}\\b`, 'i');
    if (regex.test(searchable)) {
      return asset;
    }
  }

  return null;
};

const verificationLabel = (verification?: PlaceSummary['verification']) => {
  switch (verification) {
    case 'owner':
      return 'Owner';
    case 'community':
      return 'Community';
    case 'directory':
      return 'Directory';
    default:
      return 'Unverified';
  }
};

const sortRelated = (places: PlaceSummary[]) =>
  [...places].sort((a, b) => {
    const byVerification =
      verificationPriority[a.verification ?? 'unverified'] - verificationPriority[b.verification ?? 'unverified'];
    if (byVerification !== 0) return byVerification;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });

const fetchRelatedPlaces = async (place: {
  id: string;
  city?: string | null;
  category?: string | null;
}): Promise<{ title: string; places: PlaceSummary[] }> => {
  const headerStore = headers();
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? 'localhost:3000';
  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const baseUrl = `${protocol}://${host}`;

  const candidateMap = new Map<string, PlaceSummary>();

  const addCandidates = (candidates: PlaceSummary[]) => {
    for (const candidate of candidates) {
      if (candidate.id === place.id) continue;
      if (!candidateMap.has(candidate.id)) {
        candidateMap.set(candidate.id, candidate);
      }
    }
  };

  if (place.city?.trim()) {
    const cityResponse = await fetch(
      `${baseUrl}/api/places?mode=all&city=${encodeURIComponent(place.city)}&limit=${relatedLinksLimit}`,
      { cache: 'no-store' },
    );
    if (cityResponse.ok) {
      const data = (await cityResponse.json()) as unknown;
      if (Array.isArray(data)) {
        addCandidates(data as PlaceSummary[]);
      }
    }
  }

  if (candidateMap.size < relatedLinksLimit && place.category?.trim()) {
    const categoryResponse = await fetch(
      `${baseUrl}/api/places?category=${encodeURIComponent(place.category)}&limit=${relatedLinksLimit * 3}`,
      { cache: 'no-store' },
    );
    if (categoryResponse.ok) {
      const data = (await categoryResponse.json()) as unknown;
      if (Array.isArray(data)) {
        addCandidates(data as PlaceSummary[]);
      }
    }
  }

  const sorted = sortRelated(Array.from(candidateMap.values())).slice(0, relatedLinksLimit);

  return {
    title: place.city?.trim() ? 'Related in this city' : 'Related places',
    places: sorted,
  };
};

export async function generateMetadata({ params }: PlacePageProps): Promise<Metadata> {
  const rawId = params.id;
  const id = safeDecode(rawId);
  const { place } = await getPlaceDetail(id);

  return buildPlaceMetadata({
    id,
    placeName: place?.name ?? null,
  });
}

export default async function PlaceDetailPage({ params }: PlacePageProps) {
  const rawId = params.id;
  const id = safeDecode(rawId);
  const { place } = await getPlaceDetail(id);

  if (!place) {
    notFound();
  }

  const location = formatLocation(place.city, place.country);
  const heading = location ? `${place.name} — ${location}` : place.name;
  const address = place.address_full?.trim() || formatLocation(place.city, place.country);
  const placeUrl = `${siteUrl}/place/${encodeURIComponent(place.id)}`;
  const citySlug = place.city?.trim() ? toCitySlug(place.city) : '';
  const primaryAsset = detectPrimaryAsset(place);
  const related = await fetchRelatedPlaces(place);

  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': placeUrl,
    url: placeUrl,
    name: place.name,
    ...(place.category?.trim() ? { category: place.category.trim() } : {}),
    ...(address ? { address } : {}),
    ...(place.lat != null && place.lng != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: place.lat,
            longitude: place.lng,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Map',
        item: `${siteUrl}/map`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: place.name,
        item: placeUrl,
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([localBusinessJsonLd, breadcrumbJsonLd]),
          }}
        />

        <h1 className="text-3xl font-semibold text-gray-900 sm:text-4xl">{heading}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {citySlug ? (
            <p>
              More in{' '}
              <Link href={`/city/${citySlug}`} className="font-medium text-sky-700 hover:underline">
                {place.city}
              </Link>
            </p>
          ) : null}

          {primaryAsset ? (
            <p>
              Accepts{' '}
              <Link href={`/accepts/${primaryAsset}`} className="font-medium text-sky-700 hover:underline">
                {primaryAsset}
              </Link>
            </p>
          ) : null}
        </div>

        <dl className="mt-8 grid gap-5">
          {place.category?.trim() ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Category</dt>
              <dd className="mt-1 text-base text-gray-900">{place.category}</dd>
            </div>
          ) : null}

          {place.accepted?.length ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Accepted</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {place.accepted.map((asset) => (
                  <span
                    key={asset}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800"
                  >
                    {asset}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}

          {place.paymentNote?.trim() ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Note</dt>
              <dd className="mt-1 text-base text-gray-900">{place.paymentNote}</dd>
            </div>
          ) : null}

          {address ? (
            <div>
              <dt className="text-sm font-semibold uppercase tracking-wide text-gray-500">Address</dt>
              <dd className="mt-1 text-base text-gray-900">{address}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-8">
          <Link
            href={`/map?place=${encodeURIComponent(place.id)}`}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            Open on Map
          </Link>
        </div>

        <section className="mt-10 border-t border-gray-100 pt-6">
          <h2 className="text-lg font-semibold text-gray-900">{related.title}</h2>

          {related.places.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {related.places.map((candidate) => {
                const candidateLocation =
                  formatLocation(candidate.city ?? null, candidate.country ?? null) ?? 'Location unknown';

                return (
                  <li key={candidate.id} className="rounded-lg border border-gray-200 p-4">
                    <Link href={`/place/${encodeURIComponent(candidate.id)}`} className="font-semibold text-sky-700 hover:underline">
                      {candidate.name}
                    </Link>
                    <p className="mt-1 text-sm text-gray-600">
                      {candidateLocation} · {verificationLabel(candidate.verification)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-600">No related places found.</p>
          )}
        </section>
      </article>
    </main>
  );
}
