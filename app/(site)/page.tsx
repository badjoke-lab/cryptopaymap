import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { headers } from 'next/headers';
import { buildPageMetadata } from '@/lib/seo/metadata';

const SUPPORTED_PAYMENTS = [
  {
    title: 'Coins',
    items: ['Bitcoin (BTC)', 'Ethereum (ETH)'],
  },
  {
    title: 'Bitcoin payments',
    items: ['On-chain', 'Lightning'],
  },
  {
    title: 'Stablecoins',
    items: ['USDT', 'USDC'],
  },
  {
    title: 'Networks',
    items: ['Polygon', 'Arbitrum', 'Solana'],
  },
] as const;

const REGIONS = [
  'United States',
  'France',
  'Japan',
  'Germany',
  'Canada',
  'UK',
  'Singapore',
  'Australia',
] as const;

const VERIFICATION_STEPS = [
  'Unverified – imported from OpenStreetMap (not yet verified)',
  'Community – updated/confirmed by the community',
  'Owner verified – confirmed by the business owner',
] as const;

const FAQS = [
  {
    question: 'How reliable are listings on CryptoPayMap?',
    answer:
      'Each place includes verification status so you can quickly see whether a listing is imported, community-updated, or owner confirmed.',
  },
  {
    question: 'Can I help improve the map?',
    answer: 'Yes. You can submit new places and update existing listings to keep local information accurate.',
  },
  {
    question: 'Is it free to use and submit places?',
    answer: 'Yes. Using CryptoPayMap and submitting updates are free. We’re currently supported by donations.',
  },
] as const;

type StatsResponse = {
  total_places?: number;
};

const numberFormatter = new Intl.NumberFormat('en-US');

const getTotalPlaces = async (): Promise<number | null> => {
  const headerStore = headers();
  const host = headerStore.get('host');
  if (!host) {
    return null;
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';

  try {
    const response = await fetch(`${protocol}://${host}/api/stats`, {
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as StatsResponse;
    if (typeof data.total_places === 'number') {
      return data.total_places;
    }
  } catch {
    // keep placeholder when stats endpoint is unavailable.
  }

  return null;
};

export const metadata: Metadata = buildPageMetadata({
  title: 'Find crypto-friendly places worldwide',
  description:
    'Discover cafes, shops, and services that accept cryptocurrency, then review listing trust signals before you visit.',
  path: '/',
});

export default async function HomePage() {
  const totalPlaces = await getTotalPlaces();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">CryptoPayMap</p>
        <h1 className="mt-3 text-3xl font-semibold text-gray-900 sm:text-5xl">Find places that accept crypto</h1>
        <div className="mt-5 max-w-2xl space-y-3 text-base text-gray-600 sm:text-lg">
          <p>Discover crypto-friendly cafes, shops, and services around the world.</p>
          <p>Check trusted listing signals before visiting and compare options by area.</p>
          <p>Help keep the map fresh by submitting new places and updates.</p>
        </div>

        <p className="mt-6 text-sm font-medium text-gray-700 sm:text-base">
          {totalPlaces === null ? '—' : numberFormatter.format(totalPlaces)} crypto-friendly places worldwide
        </p>

        <div className="mt-6">
          <Link
            href="/map"
            className="inline-flex w-full items-center justify-center rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white sm:w-auto"
          >
            Open Map
          </Link>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-gray-600 underline-offset-2">
            <Link href="/discover" className="text-gray-600 underline decoration-gray-300 transition hover:text-gray-900">
              Explore listings → Discover
            </Link>
            <Link href="/submit" className="text-gray-600 underline decoration-gray-300 transition hover:text-gray-900">
              Add a place → Submit
            </Link>
          </div>
        </div>

        <Link
          href="/map"
          className="group mt-8 block overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-2 transition hover:border-gray-300"
          aria-label="Open map preview and go to the map"
        >
          <Image
            src="/map-preview.svg"
            alt="Map preview placeholder for the CryptoPayMap map view"
            width={1400}
            height={780}
            className="h-auto w-full rounded-xl border border-gray-100 object-cover"
            priority
          />
        </Link>
      </section>

      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10" aria-label="Home SEO content">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Supported payments</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SUPPORTED_PAYMENTS.map((group) => (
              <div key={group.title} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{group.title}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span key={item} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Browse by region</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {REGIONS.map((region) => (
              <Link
                key={region}
                href="/discover"
                className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {region}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">How verification works</h2>
          <ul className="mt-4 space-y-2 text-gray-700">
            {VERIFICATION_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">FAQ</h2>
          <div className="mt-4 space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.question} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <summary className="cursor-pointer list-none text-base font-semibold text-gray-900">{faq.question}</summary>
                <p className="mt-2 text-sm leading-6 text-gray-700">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-gray-900">Support this project</h2>
          <p className="mt-1 text-sm text-gray-600">Help us keep CryptoPayMap free and up to date.</p>
          <Link
            href="/donate"
            className="mt-3 inline-flex rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
          >
            Donate
          </Link>
        </div>
      </section>
    </main>
  );
}
