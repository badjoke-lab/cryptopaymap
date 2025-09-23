import "./globals.css";
export const metadata = { title: "CryptoPayMap" };
export default function RootLayout({ children }: { children: React.ReactNode }){
 return (
 <html lang="en">
 <body>
 <header className="fixed top-0 inset-x-0 z-[30] bg-white/90 backdrop-blur border-b">
 <nav className="mx-auto max-w-6xl px-4 h-12 flex items-center gap-6">
 <a href="/" className="font-semibold">CryptoPayMap</a>
 <a href="/map" className="text-sm">Map</a>
 <a href="/discover" className="text-sm">Discover</a>
 <a href="/coins" className="text-sm">Coins</a>
 <a href="/news" className="text-sm">News</a>
 <a href="/about" className="text-sm">About</a>
 <a href="/disclaimer" className="text-sm">Disclaimer</a>
 <a href="/donate" className="ml-auto inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-white text-sm">Donate</a>
 </nav>
 </header>
 <main className="pt-12 min-h-screen">{children}</main>
 <div id="cpm-portal-root" />
 </body>
 </html>
 )
}
