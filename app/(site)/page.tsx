import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { HomeTotalPlaces } from './HomeTotalPlaces';

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
  { name: 'United States', iso2: 'US' },
  { name: 'France', iso2: 'FR' },
  { name: 'Japan', iso2: 'JP' },
  { name: 'Germany', iso2: 'DE' },
  { name: 'Canada', iso2: 'CA' },
  { name: 'UK', iso2: 'GB' },
  { name: 'Singapore', iso2: 'SG' },
  { name: 'Australia', iso2: 'AU' },
] as const;

const BROWSE_ASSETS = ['BTC', 'ETH', 'USDT', 'USDC', 'SOL', 'XRP'] as const;

const FEATURED_CITIES = ['Berlin', 'Tokyo', 'Singapore'] as const;

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

export const metadata: Metadata = buildPageMetadata({
  title: 'Find crypto-friendly places worldwide',
  description:
    'Discover cafes, shops, and services that accept cryptocurrency, then review listing trust signals before you visit.',
  path: '/',
});

export default function HomePage() {
  const primaryCtaClass =
    'inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-transparent bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition duration-150 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-sm active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:w-auto';
  const previewLinkClass =
    'group mt-8 block cursor-pointer overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-2 transition duration-150 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
  const secondaryCtaClass =
    'mt-3 inline-flex cursor-pointer rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition duration-150 hover:-translate-y-0.5 hover:border-gray-400 hover:bg-white hover:shadow-sm active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
  const inlineLinkClass =
    'text-gray-600 underline decoration-gray-300 underline-offset-2 transition duration-150 hover:-translate-y-0.5 hover:text-gray-900 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

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

        <HomeTotalPlaces />

        <div className="mt-6">
          <Link href="/map" className={primaryCtaClass}>
            Open Map
          </Link>
        </div>

        <Link href="/map" className={previewLinkClass} aria-label="Open map preview and go to the map">
          <Image
            src="/map-preview.webp"
            alt="Map preview placeholder for the CryptoPayMap map view"
            width={1400}
            height={780}
            className="h-auto w-full rounded-xl border border-gray-100 object-cover transition duration-150 group-hover:scale-[1.01]"
            priority
          />
          <p className="mt-2 px-2 text-xs font-medium text-gray-500">
            <span className="hidden sm:inline">Click to open map</span>
            <span className="sm:hidden">Tap to open map</span>
          </p>
        </Link>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-gray-600 underline-offset-2">
          <Link href="/discover" className={inlineLinkClass}>
            Find popular spots fast → Discover
          </Link>
          <Link href="/stats" className={inlineLinkClass}>
            Check coverage & trends → Stats
          </Link>
        </div>
      </section>

      <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10" aria-label="Home SEO content">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Supported payments</h2>
          <p className="mt-2 text-sm text-gray-700">Popular assets and payment rails found across listed places.</p>
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

        <div className="mt-8">
          <h2 className="text-2xl font-semibold text-gray-900">Browse by asset</h2>
          <p className="mt-2 text-sm text-gray-700">Jump directly to places that accept a specific crypto asset.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {BROWSE_ASSETS.map((asset) => (
              <Link
                key={asset}
                href={`/accepts/${asset}`}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {asset}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Browse by region</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {REGIONS.map((region) => (
              <Link
                key={region.iso2}
                href={`/map?country=${region.iso2}`}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {region.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Browse by city</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {FEATURED_CITIES.map((city) => (
              <Link
                key={city}
                href={`/city/${encodeURIComponent(city.toLowerCase())}`}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {city}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-2xl font-semibold text-gray-900">Help improve the map</h2>
          <p className="mt-2 text-sm text-gray-700">Submit a new place or update an existing listing.</p>
          <Link href="/submit" className={secondaryCtaClass}>
            Submit a place
          </Link>
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
