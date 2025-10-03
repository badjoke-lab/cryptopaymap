/* scripts/fix_accepts_shape.ts
 * payment.accepts[*] をスキーマ許可キーだけに強制整形するクリーンアップ。
 * keep: asset, chain, processor?, evidence?, last_verified?, last_checked?, notes?
 * drop: それ以外（例: method, symbol, address など）
 */
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

type Accept = {
  asset: string;
  chain: string;
  processor?: string;
  evidence?: string[];
  last_verified?: string;
  last_checked?: string;
  notes?: string;
};

const ROOT = process.argv[2] || "public/data/places";

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && p.endsWith(".json")) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const isEip155 = (s: string) => /^eip155:\d+$/.test(s);
const chainOk = (c: string) =>
  c === "bitcoin" || c === "lightning" || c === "solana" ||
  c === "tron" || c === "dogecoin" || c === "litecoin" || isEip155(c);

function up(v: any) { return String(v ?? "").trim().toUpperCase(); }
function normChain(v: any) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return s;
  // よくある別名
  if (s === "btc") return "bitcoin";
  if (s === "ln") return "lightning";
  if (s === "eth" || s === "ethereum") return "eip155:1";
  if (s === "polygon" || s === "matic") return "eip155:137";
  if (s === "arbitrum") return "eip155:42161";
  if (s === "optimism") return "eip155:10";
  if (s === "base") return "eip155:8453";
  if (s === "bsc" || s === "binance-smart-chain") return "eip155:56";
  if (s === "avalanche") return "eip155:43114";
  return s;
}

function cleanseAccept(raw: any): Accept | null {
  const asset = up(raw?.asset);
  const chain = normChain(raw?.chain);

  if (!asset || !chain) return null;

  // ルール: LNはBTCのみ / BTCはbitcoin|lightningのみ
  if (chain === "lightning" && asset !== "BTC") return null;
  if (asset === "BTC" && !(chain === "bitcoin" || chain === "lightning")) return null;
  if (!chainOk(chain)) return null;

  const out: Accept = { asset, chain };

  if (typeof raw?.processor === "string" && raw.processor.trim()) {
    out.processor = raw.processor.trim();
  }
  if (Array.isArray(raw?.evidence)) {
    const ev = raw.evidence
      .filter((u: any) => typeof u === "string" && /^https?:\/\//i.test(u));
    if (ev.length) out.evidence = Array.from(new Set(ev));
  }
  if (typeof raw?.last_verified === "string" && raw.last_verified.trim()) {
    out.last_verified = raw.last_verified.trim();
  }
  if (typeof raw?.last_checked === "string" && raw.last_checked.trim()) {
    out.last_checked = raw.last_checked.trim();
  }
  if (typeof raw?.notes === "string" && raw.notes.trim()) {
    out.notes = raw.notes.trim();
  }
  return out;
}

function dedupe(list: Accept[]): Accept[] {
  const seen = new Set<string>();
  const out: Accept[] = [];
  for (const a of list) {
    const key = `${a.asset}#${a.chain}#${a.processor ?? "other"}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

(function main() {
  const files = listJsonFiles(ROOT);
  let touched = 0;

  for (const f of files) {
    let json: any;
    try { json = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }

    const places: any[] = Array.isArray(json)
      ? json
      : (json.places || json.items || json.results || json.data || json.entries || []);

    if (!Array.isArray(places)) continue;

    let changed = false;

    for (const place of places) {
      const p = place.payment || {};
      const inAcc: any[] = Array.isArray(p.accepts) ? p.accepts : [];
      const outAcc = dedupe(
        inAcc.map(cleanseAccept).filter(Boolean) as Accept[]
      );

      if (JSON.stringify(inAcc) !== JSON.stringify(outAcc)) {
        place.payment = { ...p, accepts: outAcc };

        // preferred ⊆ accepts に強制
        if (Array.isArray(p.preferred)) {
          const ok = new Set(outAcc.map(a => `${a.asset}@${a.chain}`));
          place.payment.preferred = p.preferred.filter((s: any) =>
            typeof s === "string" && ok.has(s)
          );
        }
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(f, JSON.stringify(json, null, 2) + "\n", "utf8");
      console.log(`[fixed] ${f}`);
      touched++;
    }
  }

  console.log(`Done. files touched=${touched}`);
})();
