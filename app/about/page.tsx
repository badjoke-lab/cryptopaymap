// app/about/page.tsx
import Link from "next/link";

export const metadata = {
  title: "About | CryptoPayMap",
  description:
    "CryptoPayMap helps you discover where crypto can be used for payments — via map, stats, and curated news. Donations directly support hosting, map tiles, data curation, and ongoing development.",
};

export default function AboutPage() {
  return (
    <main className="pt-[var(--header-h,64px)] mx-auto max-w-6xl px-4 md:px-6 py-10 space-y-10">
      {/* タイトル行：他ページと同じ骨格 */}
      <section className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">About CryptoPayMap</h1>
        <div>
          <Link
            href="/donate"
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 transition"
          >
            <span>Donate</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </section>

      {/* リード文 */}
      <section className="space-y-3">
        <p className="text-[15px] leading-relaxed text-gray-700">
          CryptoPayMap helps you quickly see where crypto can be used for
          payments—via an interactive map, lightweight stats, and curated
          headlines. Running this project requires{" "}
          <strong>ongoing hosting, map tiles, and manual data work</strong>. If
          you find it useful, <strong>your donation directly keeps it online and
          improving</strong>.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">What this site does</h2>
        <ul className="list-disc pl-5 space-y-1 text-[15px]">
          <li>
            <strong>Map</strong> — Filter by coin, category, and city to find
            in-person spots and ATMs. Popups show name · city/country · category
            · coins · last verified with a <em>View details</em> link. The
            drawer (mobile: bottom sheet) includes address copy, website, and{" "}
            <em>Navigate</em> links (Google / Apple / OSM). Nearby (Top 5) and
            URL deep-links are supported.
          </li>
          <li>
            <strong>News</strong> — English-only headlines about real-world
            crypto payments. Sort by <em>New / Coverage / Hot</em>; coin,
            region, and category filters help you narrow quickly. Coverage
            reflects breadth; Hot emphasizes freshness.
          </li>
          <li>
            <strong>Discover</strong> — Cross-section browsing by cities,
            categories, and topics to jump into interesting clusters.
          </li>
          <li>
            <strong>Coins</strong> — Per-coin snapshots and recent headlines
            when available.
          </li>
          <li>
            <strong>Donate</strong> — Support hosting and data work. Details at{" "}
            <code>/donate</code>.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">How to use it well</h2>
        <ul className="list-disc pl-5 space-y-1 text-[15px]">
          <li>
            On Map, refine filters first—URL updates are debounced so sharing a
            state is quick.
          </li>
          <li>
            On News, start with <em>Coverage</em> or <em>Hot</em> to spot
            adoption clusters, then open what you care about.
          </li>
          <li>
            If a page looks empty, there’s likely no recent data for the current
            filters or region.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Data & updates</h2>
        <ul className="list-disc pl-5 space-y-1 text-[15px]">
          <li>
            <strong>Sources</strong> — OpenStreetMap and other public data plus
            manual curation; selected feeds are reviewed for relevance and
            safety.
          </li>
          <li>
            <strong>Categories</strong> — Focused on real-world usage
            (restaurants, cafés, bars, retail, services, ATMs, etc.).
          </li>
          <li>
            <strong>Updates</strong> — Structured content is refreshed
            regularly. Empty-state messages appear when nothing matches.
          </li>
          <li>
            <strong>Quality</strong> — No guarantees of completeness or
            freshness. Please verify before visiting a place.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Disclaimer</h2>
        <p className="text-[15px] text-gray-700 leading-relaxed">
          This site is not investment advice. We do not guarantee accuracy or
          availability of any location or external link. Use at your own risk
          and beware of scams/phishing on external sites.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Contributions</h2>
        <p className="text-[15px] text-gray-700 leading-relaxed">
          Contributions are welcome in the form of{" "}
          <strong>data fixes/additions and news-source suggestions</strong>.
          Your input improves coverage and accuracy for everyone.
        </p>
        <p className="text-[15px] text-gray-700 leading-relaxed">
          The project is funded through{" "}
          <strong>
            sponsored listings, Pro features, API access, and individual
            donations
          </strong>
          . Even small recurring support makes a meaningful difference and helps
          us continue development.
        </p>
        <div className="pt-2">
          <Link
            href="/donate"
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800 transition"
          >
            <span>Donate</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Roadmap (excerpt)</h2>
        <ul className="list-disc pl-5 space-y-1 text-[15px]">
          <li>Publish & promotion</li>
          <li>Coins: per-symbol news/cities/map</li>
          <li>Map filter UX tune, empty-state polish, basic metrics/logging</li>
        </ul>
        <p className="text-[15px] text-gray-700 leading-relaxed">
          Your support keeps the project moving.
        </p>
      </section>
    </main>
  );
}
