// scripts/migrate-to-v2.ts — minimal conservative migration to v2 (no `method` in output)
import fs from "fs";
import path from "path";

const ROOT = process.argv[2] || "public/data/places";

type Accept = {
  asset: string;
  chain: string;
  processor?: "btcpay"|"opennode"|"strike"|"coinbase-commerce"|"nowpayments"|"bitpay"|"self-hosted"|"other";
  notes?: string;
  evidence?: string[];
  last_verified?: string;
  last_checked?: string;
};

type Place = {
  id: string|number;
  name: string;
  lat?: number; lng?: number;
  location?: { lat?: number; lon?: number; address?: string; city?: string; country?: string };
  payment?: { accepts?: Accept[]; preferred?: string[] };
  verification?: { status?: "owner"|"community"|"directory"|"unverified"; [k:string]: any };
  [k: string]: any;
};

function files(dir: string): string[] {
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

function pushAccept(list: Accept[], a: Partial<Accept>) {
  if (!a.asset || !a.chain) return;
  const asset = a.asset.toUpperCase();
  const chain = a.chain;
  const uk = `${asset}#${chain}#${a.processor||"other"}`;
  if (list.find(x => `${x.asset}#${x.chain}#${x.processor||"other"}` === uk)) return;
  list.push({ asset, chain, processor: a.processor, notes: a.notes, evidence: a.evidence, last_checked: a.last_checked, last_verified: a.last_verified });
}

function migrate(place: Place): Place {
  const p: Place = JSON.parse(JSON.stringify(place)); // deep copy

  // coords -> location
  if (!p.location) p.location = {};
  if (typeof p.lat === "number") { p.location.lat = p.lat; delete (p as any).lat; }
  if (typeof p.lng === "number") { p.location.lon = p.lng; delete (p as any).lng; }

  if (!p.payment) p.payment = {};
  if (!Array.isArray(p.payment.accepts)) p.payment.accepts = [];

  // legacy booleans/examples -> accepts
  const legacy = (place as any).payment || place;

  if (legacy.btc === true || legacy.payment_btc === true) {
    pushAccept(p.payment.accepts, { asset: "BTC", chain: "bitcoin" });
  }
  if (legacy.ln === true || legacy.btc_ln === true || legacy.payment_btc_ln === true) {
    pushAccept(p.payment.accepts, { asset: "BTC", chain: "lightning" });
  }
  if (legacy.eth === true || legacy.payment_eth === true) {
    pushAccept(p.payment.accepts, { asset: "ETH", chain: "evm-mainnet" });
  }
  // examples for USDT/USDC if legacy flags exist:
  if (legacy.usdt_eth === true) pushAccept(p.payment.accepts, { asset: "USDT", chain: "evm-mainnet" });
  if (legacy.usdt_polygon === true) pushAccept(p.payment.accepts, { asset: "USDT", chain: "polygon" });
  if (legacy.usdc_eth === true) pushAccept(p.payment.accepts, { asset: "USDC", chain: "evm-mainnet" });
  if (legacy.usdc_polygon === true) pushAccept(p.payment.accepts, { asset: "USDC", chain: "polygon" });

  // cleanup invalid combos
  p.payment.accepts = (p.payment.accepts || []).filter(a => {
    if (!a.asset || !a.chain) return false;
    if (a.chain === "lightning" && a.asset !== "BTC") return false;        // non-BTC on lightning = invalid
    if (a.asset === "BTC" && !(a.chain === "bitcoin" || a.chain === "lightning")) return false;
    return true;
  });

  // preferred subset
  if (Array.isArray(p.payment.preferred)) {
    const set = new Set((p.payment.accepts||[]).map(a => `${a.asset}@${a.chain}`));
    p.payment.preferred = p.payment.preferred.filter(s => set.has(s));
  }

  if (!p.verification) p.verification = { status: "unverified" };

  return p;
}

(function main(){
  const list = files(ROOT);
  let touched = 0;
  for (const f of list) {
    const raw = fs.readFileSync(f, "utf8");
    let data: any; try { data = JSON.parse(raw); } catch { continue; }
    const arr: Place[] = Array.isArray(data) ? data : [data];
    const out = arr.map(migrate);
    const next = Array.isArray(data) ? out : out[0];
    const pretty = JSON.stringify(next, null, 2) + "\n";
    if (pretty !== (raw.endsWith("\n") ? raw : raw + "\n")) {
      fs.writeFileSync(f, pretty, "utf8");
      console.log(`[migrated] ${f}`);
      touched++;
    }
  }
  console.log(`migrate-to-v2: files_changed=${touched}, scanned=${list.length}`);
})();
