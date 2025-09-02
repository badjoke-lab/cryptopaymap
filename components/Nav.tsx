'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav(){
  const path = usePathname() || "";
  const is = (p: string) => path.startsWith(p);
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-inner">
        <Link href="/map" className="brand">CryptoPayMap</Link>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <Link href="/map" className={`link ${is("/map") ? "active":""}`}>Map</Link>
          <Link href="/discover" className={`link ${is("/discover") ? "active":""}`}>Discover</Link>
          <Link href="/news" className={`link ${is("/news") ? "active":""}`}>News</Link>
          <Link href="/about" className={`link ${is("/about") ? "active":""}`}>About</Link>
          <Link href="/donate" className={`link ${is("/donate") ? "active":""}`}>Donate</Link>
        </div>
      </div>
    </nav>
  );
}
