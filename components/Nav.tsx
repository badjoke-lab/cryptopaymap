'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DEFAULT_COIN = (process.env.NEXT_PUBLIC_DEFAULT_COIN ?? 'BTC').toUpperCase();

export default function Nav() {
  const path = usePathname() || '';
  const is = (p: string) => path === p || path.startsWith(p);

  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-inner">
        <Link href="/map" className="brand">
          CryptoPayMap
        </Link>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/map" className={`link ${is('/map') ? 'active' : ''}`} aria-current={is('/map') ? 'page' : undefined}>
            Map
          </Link>

          <Link
            href="/discover"
            className={`link ${is('/discover') ? 'active' : ''}`}
            aria-current={is('/discover') ? 'page' : undefined}
          >
            Discover
          </Link>

          {/* Coins は詳細に直行させる */}
          <Link
            href={`/coins/${DEFAULT_COIN}`}
            className={`link ${is('/coins') ? 'active' : ''}`}
            aria-current={is('/coins') ? 'page' : undefined}
          >
            Coins
          </Link>

          <Link href="/news" className={`link ${is('/news') ? 'active' : ''}`} aria-current={is('/news') ? 'page' : undefined}>
            News
          </Link>

          <Link href="/about" className={`link ${is('/about') ? 'active' : ''}`} aria-current={is('/about') ? 'page' : undefined}>
            About
          </Link>

          <Link
            href="/donate"
            className={`link ${is('/donate') ? 'active' : ''}`}
            aria-current={is('/donate') ? 'page' : undefined}
          >
            Donate
          </Link>
        </div>
      </div>
    </nav>
  );
}
