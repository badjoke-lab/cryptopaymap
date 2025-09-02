// server component
import DonateList from "@/components/DonateList";

export const metadata = { title: "Donate — CryptoPayMap" };

type Row = { chain: string; address: string; note?: string };

const ROWS: Row[] = [
  { chain: "BTC",            address: "bc1qhg2a9yp6nwdlfuzvm70dpzfun0xzrctn4cyzlt", note: "Bitcoin (Native SegWit)" },
  { chain: "ETH (ERC-20)",   address: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { chain: "USDT (ERC-20)",  address: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { chain: "USDC (ERC-20)",  address: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { chain: "SOL",            address: "7aqoEHgKniBoUbgyJLBEsGKZG2K3seTsbCwQrxAi9DMR" },
  { chain: "BNB (BEP-20)",   address: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" },
  { chain: "DOGE",           address: "DBcD6vrY1KWZGxzohaADF2LYKkZbL1qD8q" },
  { chain: "AVAX",           address: "0xc0c79cacdcb6e152800c8e1c1d73ab647a1132f9" }
];

export default function DonatePage() {
  return (
    <div className="container" style={{ paddingTop: 16 }}>
      <h1>Donate</h1>
      <p style={{ marginTop: 8, color: "#555" }}>
        If this project helps you, consider supporting development. Please send only on the exact network listed.
      </p>
      <DonateList rows={ROWS} />
      <p style={{ fontSize: 12, color: "#666", marginTop: 14 }}>
        Donations are voluntary and non-refundable. Thank you for your support!
      </p>
    </div>
  );
}
