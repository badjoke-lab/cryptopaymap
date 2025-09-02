'use client';
import { useState } from "react";
type Row = { chain: string; address: string; note?: string };
export default function DonateList({ rows }: { rows: Row[] }) {
  const [copied, setCopied] = useState<string>("");
  async function copy(addr: string){ try{ await navigator.clipboard.writeText(addr); setCopied(addr); setTimeout(()=>setCopied(""), 1200); }catch{} }
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {rows.map((r) => (
        <div key={r.chain} style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{r.chain}</div>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, marginTop: 4 }}>{r.address}</div>
              {r.note && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{r.note}</div>}
            </div>
            <button className="badge" onClick={() => copy(r.address)}>Copy</button>
          </div>
          {copied === r.address && <div className="badge" style={{ marginTop: 8 }}>Copied</div>}
        </div>
      ))}
    </div>
  );
}
