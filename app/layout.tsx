import type { Metadata } from 'next';
import 'leaflet/dist/leaflet.css';          // Leaflet の CSS を先に
import '@/styles/globals.css';              // ← 相対ではなく styles を指す

import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'CryptoPayMap',
  description: 'Find places that accept crypto.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
