// app/about/page.tsx
import Link from "next/link";
import s from "./page.module.css";

export const metadata = {
  title: "About – CryptoPayMap",
  description:
    "What CryptoPayMap is, how to use the site, data sources and limits, and how you can support the project.",
};

export default function AboutPage() {
  return (
    <main className={s.wrap}>
      {/* Hero */}
      <section className={s.hero}>
        <h1 className={s.h1}>About CryptoPayMap</h1>
        <p className={s.lead}>
          A community project to quickly see{" "}
          <strong>where crypto can be used for payments</strong>—via an
          interactive map and lightweight stats.
        </p>
        <div className={s.ctaRow}>
          <Link href="/donate" className={s.btnPrimary} aria-label="Donate">
            Donate
          </Link>
          <Link href="/map" className={s.btnGhost} aria-label="Open the map">
            Open Map
          </Link>
        </div>
        <p className={s.note}>
          Hosting, tile serving, and data curation cost time and money. If you
          find this useful, please consider supporting the project.{" "}
          <Link href="/donate" className={s.link}>
            Your donation helps us keep the lights on.
          </Link>
        </p>
      </section>

      {/* What you can do */}
      <section className={s.section}>
        <h2 className={s.h2}>What this site does</h2>
        <ul className={s.list}>
          <li>
            <strong>Map</strong> — Filter by <em>coin</em>, <em>category</em>,
            and <em>city</em> to find in-person spots, ATMs, and online
            services. Fast interaction with URL sync and stability tweaks for
            tiles/icons.
          </li>
          <li>
            <strong>Coins</strong> — Per-coin dashboard like{" "}
            <code>/coins/BTC</code>. It shows:
            <ul className={s.sublist}>
              <li>
                <strong>Summary cards</strong>: Total Spots / In-person / ATM /
                Online
              </li>
              <li>
                <strong>Adoption by Region</strong>: per-country counts and
                share (%)
              </li>
              <li>
                <strong>Recent Headlines</strong>: shown when on-disk JSON is
                available (see “Data & Updates”)
              </li>
              <li>
                <strong>Coin switcher chips</strong> at the top to jump to other
                symbols (e.g., <code>/coins/ETH</code>).
              </li>
            </ul>
          </li>
          <li>
            <strong>Discover</strong> — Cross-section browsing by cities,
            categories, and topics. We’re improving transitions and empty-state
            handling for v2.
          </li>
          <li>
            <strong>News</strong> — Coin/region related headlines, shared with
            the Coins page (coming online gradually).
          </li>
          <li>
            <strong>Donate</strong> — Support the project’s hosting and data
            work. Details live at{" "}
            <Link href="/donate" className={s.link}>
              /donate
            </Link>
            .
          </li>
        </ul>
      </section>

      {/* How to use */}
      <section className={s.section}>
        <h2 className={s.h2}>How to use it well</h2>
        <ul className={s.list}>
          <li>
            On <strong>Map</strong>, refine filters first—URL updates are
            debounced to keep interactions snappy.
          </li>
          <li>
            On <strong>Coins</strong>, start with the summary cards, then scan{" "}
            <em>Adoption by Region</em> to understand distribution and relative
            share. Use the chip switcher to move between coins quickly.
          </li>
          <li>
            If a page looks empty, check <code>public/data/…</code> paths or
            visit <strong>Discover</strong> to jump in from curated entry
            points.
          </li>
        </ul>
      </section>

      {/* Data & limits */}
      <section className={s.section}>
        <h2 className={s.h2}>Data & updates</h2>
        <ul className={s.list}>
          <li>
            <strong>Sources</strong>: OpenStreetMap and other public data +
            manual curation; selected external feeds in the future.
          </li>
          <li>
            <strong>Categories</strong>:
            <ul className={s.sublist}>
              <li>
                <em>In-person</em> — brick-and-mortar acceptance
              </li>
              <li>
                <em>ATM</em> — crypto ATMs
              </li>
              <li>
                <em>Online</em> — online services counted per country
              </li>
            </ul>
          </li>
          <li>
            <strong>Updates</strong>: replace files under{" "}
            <code>public/data/…</code> to refresh the site; in production, we
            generate these during build.
          </li>
          <li>
            <strong>Coins headlines</strong>: place JSON at one of:
            <ul className={s.sublist}>
              <li>
                <code>public/data/aggregates/news/coins/&lt;SYMBOL&gt;.json</code>
              </li>
              <li>
                <code>public/data/aggregates/coins-headlines/&lt;SYMBOL&gt;.json</code>
              </li>
              <li>
                <code>public/data/news/&lt;SYMBOL&gt;.json</code>
              </li>
            </ul>
            The UI displays up to 10 items when present.
          </li>
          <li className={s.muted}>
            No guarantees of completeness or freshness. Please verify on site
            before visiting a place.
          </li>
        </ul>
      </section>

      {/* Disclaimer */}
      <section className={s.section}>
        <h2 className={s.h2}>Disclaimer</h2>
        <p className={s.text}>
          This site is not investment advice. We do not guarantee accuracy or
          availability of any location or link. Use at your own risk and beware
          of scams/phishing on external sites.
        </p>
      </section>

      {/* Open source & contribute */}
      <section className={s.section}>
        <h2 className={s.h2}>Open source & how to contribute</h2>
        <ul className={s.list}>
          <li>
            Repository: <code>github.com/badjoke-lab/cryptopaymap</code>
          </li>
          <li>
            Contributions welcome: data fixes/additions, UI/UX improvements,
            translations, build scripts.
          </li>
          <li>
            Release policy: small safe changes → preview on Vercel → promote to
            production.
          </li>
        </ul>
      </section>

      {/* Roadmap */}
      <section className={s.section}>
        <h2 className={s.h2}>Roadmap (excerpt)</h2>
        <ul className={s.list}>
          <li>
            <strong>v2 (publish & promotion)</strong> — this About, Coins chip
            switcher, sortable/searchable region table (lite), Map filter UX
            tune, Discover transitions and empty-state polish.
          </li>
          <li>
            <strong>v2.x (stability & expansion)</strong> —{" "}
            <code>/coins/[symbol]/news</code>,{" "}
            <code>/coins/[symbol]/cities</code>,{" "}
            <code>/coins/[symbol]/map</code>; basic metrics/error logging.
          </li>
        </ul>
      </section>

      {/* Closing CTA */}
      <section className={s.section}>
        <div className={s.ctaBlock}>
          <p className={s.ctaTitle}>
            Your small recurring support keeps the project moving.
          </p>
          <Link href="/donate" className={s.btnPrimary}>
            Donate
          </Link>
        </div>
      </section>

      <footer className={s.foot}>
        <span>© CryptoPayMap contributors</span>
        <span className={s.sep}>•</span>
        <span className={s.muted}>© OpenStreetMap contributors</span>
      </footer>
    </main>
  );
}
