// app/layout.tsx  — replace file (FULL)
import "./globals.css";
import dynamic from "next/dynamic";

export const metadata = { title: "CryptoPayMap" };

// Client-only menu (no SSR) to avoid hydration mismatch
const SubmitMenuClient = dynamic(() => import("./SubmitMenuClient"), { ssr: false });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          className="fixed top-0 inset-x-0 z-[1200] bg-white/90 backdrop-blur border-b"
          style={{ ["--cpm-header-h" as any]: "56px" }}
        >
          <nav className="mx-auto max-w-6xl px-4 h-12 flex items-center gap-6 relative">
            <a href="/" className="font-semibold">CryptoPayMap</a>
            <a href="/map" className="text-sm">Map</a>
            <a href="/discover" className="text-sm">Discover</a>
            <a href="/coins" className="text-sm">Coins</a>
            <a href="/news" className="text-sm">News</a>
            <a href="/about" className="text-sm">About</a>
            <a href="/disclaimer" className="text-sm">Disclaimer</a>

            {/* NOTE:
                ボタンはサーバ側で出す（静的）。メニュー本体はクライアント専用コンポーネントで作るため、
                サーバとクライアントの DOM 構造差が発生せず hydration エラーを防げる。
            */}
            <div className="relative inline-block ml-2">
              <button
                id="submitMenuBtn"
                type="button"
                className="text-sm px-2 py-1 rounded hover:bg-neutral-100 focus:outline-none focus:ring"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="submit-menu"
              >
                Submit / Report
              </button>
            </div>

            <a href="/donate" className="ml-auto inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-white text-sm">Donate</a>
          </nav>
        </header>

        {/* main content */}
        <main className="pt-12 min-h-screen">{children}</main>

        {/* client-only menu component (rendered only on client, will portal to body) */}
        <SubmitMenuClient />

        <div id="cpm-portal-root" />
      </body>
    </html>
  );
}
