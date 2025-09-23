// app/donate/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

type Entry = {
  label: string;
  note?: string;
  addr: string;
};

const ENTRIES: Entry[] = [
  { label: "BTC (Bitcoin / Native SegWit)", addr: "bc1qhg2a9yp6nwdlfuzvm70dpzfun0xzrctn4cyzlt" },
  { label: "ETH (ERC-20)", addr: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { label: "USDT (ERC-20)", addr: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { label: "USDC (ERC-20)", addr: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { label: "XRP (XRP)", addr: "rHFpSj15qmruSpptrVZxGZxDPGVjNRu95S" },
  { label: "SOL (Solana)", addr: "7aqoEHgKniBoUbgyJLBEsGKZG2K3seTsbCwQrxAi9DMR" },
  { label: "BNB (BEP-20)", addr: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { label: "DOGE (Dogecoin)", addr: "DBcD6vrY1KWZGxzohaADF2LYKkZbL1qD8q" },
  { label: "AVAX (C-Chain / ERC-20)", addr: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" }
];

function CopyButton({ value }: { value: string }) {
  const [ok, setOk] = useState<null | "copied" | "error">(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setOk("copied");
      setTimeout(() => setOk(null), 1500);
    } catch {
      setOk("error");
      setTimeout(() => setOk(null), 1500);
    }
  };
  return (
    <button
      onClick={copy}
      className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50 active:scale-[0.99] transition"
      aria-label="Copy address"
      title="Copy"
    >
      {ok === "copied" ? "Copied" : ok === "error" ? "Error" : "Copy"}
    </button>
  );
}

export default function Donate() {
  return (
    <main className="pt-[var(--header-h,64px)] mx-auto max-w-6xl px-4 md:px-6 py-10 space-y-8">
      {/* タイトル行：他ページと統一 */}
      <section className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold">Donate</h1>
        <div className="text-sm text-gray-500">
          <Link href="/about" className="underline hover:no-underline">
            What your donation supports ↗
          </Link>
        </div>
      </section>

      {/* リード文（文面はそのまま、クラス統一） */}
      <section className="space-y-3">
        <p className="text-[15px] leading-relaxed text-gray-700">
          If this project helps you, consider supporting development.
          <strong> Please send only on the exact network listed.</strong>
          Donations are voluntary and non-refundable. Thank you!
        </p>
      </section>

      {/* アドレス一覧：カードUIを他ページと揃える */}
      <section className="max-w-xl">
        <ul className="space-y-3">
          {ENTRIES.map((e) => (
            <li key={e.label} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="font-semibold">{e.label}</div>
                <CopyButton value={e.addr} />
              </div>
              {e.note && <div className="text-xs text-gray-500 mt-0.5">{e.note}</div>}
              <code className="mt-2 block break-all rounded-lg bg-gray-50 px-3 py-2 text-[13px]">
                {e.addr}
              </code>
            </li>
          ))}
        </ul>
      </section>

      {/* 免責：他ページのトーンに合わせる */}
      <section>
        <p className="text-[13px] text-gray-500">
          Data sources: OpenStreetMap contributors. Use at your own risk. No warranty.
        </p>
      </section>
    </main>
  );
}
