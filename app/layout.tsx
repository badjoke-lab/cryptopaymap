import "./../styles/globals.css";
import Script from "next/script";
import Nav from "@/components/Nav";

export const metadata = { title: "CryptoPayMap", description: "Find places that accept crypto payments" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const noindex = process.env.FEATURE_NOINDEX === "true" || process.env.FEATURE_NOINDEX === "1";
  const plausibleDomain = process.env.PLAUSIBLE_DOMAIN || "";
  return (
    <html lang="en">
      <head>
        {noindex && <meta name="robots" content="noindex,nofollow,noarchive" />}
        {plausibleDomain && (
          <Script src="https://plausible.io/js/script.js" data-domain={plausibleDomain} strategy="afterInteractive" />
        )}
      </head>
      <body>
        <Nav />
        {children}
        <footer className="footer">
          <div className="container">
            Data sources: OpenStreetMap contributors. Use at your own risk. No warranty.
          </div>
        </footer>
      </body>
    </html>
  );
}
