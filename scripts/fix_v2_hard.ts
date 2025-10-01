// scripts/fix_v2_hard.ts
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

type Accept = {
  asset: string;
  chain: string;
  method?: "onchain" | "lightning";
  processor?: string;
  evidence?: string[];
  last_verified?: string;
  last_checked?: string;
};

const CHAIN_ALIASES: Record<string, string> = {
  bitcoin: "bitcoin",
  btc: "bitcoin",
  lightning: "lightning",
  ln: "lightning",
  sol: "solana",
  solana: "solana",
  tron: "tron",
  trc20: "tron",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  ltc: "litecoin",
  litecoin: "litecoin",
  eth: "eip155:1",
  ethereum: "eip155:1",
  polygon: "eip155:137",
  matic: "eip155:137",
  arbitrum: "eip155:42161",
  optimism: "eip155:10"
};

const isEvmId = (s: string) => /^eip155:\d+$/.test(s);

const normChain = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if (!k) return null;
  if (CHAIN_ALIASES[k]) return CHAIN_ALIASES[k];
  if (isEvmId(k)) return k;
  return k; // keep; validator may flag later
};

const autoMethod = (chain: string) => (chain === "lightning" ? "lightning" : "onchain");

function coinsToOnchainAccepts(coins: unknown): Accept[] {
  const out: Accept[] = [];
  if (!Array.isArray(coins)) return out;
  for (const c of coins) {
    const sym = String(c || "").trim().toUpperCase();
    if (!sym) continue;
    if (sym === "BTC") out.push({ asset: "BTC", chain: "bitcoin", method: "onchain", processor: "other" });
    else if (sym === "ETH") out.push({ asset: "ETH", chain: "eip155:1", method: "onchain", processor: "other" });
    else if (sym === "USDT" || sym === "USDC") {
      // Default EVM mainnet when chain is unknown
      out.push({ asset: sym, chain: "eip155:1", method: "onchain", processor: "other" });
    } else if (sym === "LTC") {
      out.push({ asset: "LTC", chain: "litecoin", method: "onchain", processor: "other" });
    } else if (sym === "DOGE") {
      out.push({ asset: "DOGE", chain: "dogecoin", method: "onchain", processor: "other" });
    }
  }
  return out;
}

function normalizeAccept(a: any): Accept | null {
  if (!a || typeof a !== "object") return null;

  const asset = String(a.asset || "").trim().toUpperCase();
  const chain = normChain(a.chain ?? "");
  if (!asset || !chain) return null;

  if (chain === "lightning" && asset !== "BTC") return null; // lightning supports BTC only

  const method: "onchain" | "lightning" =
    a.method === "lightning" || a.method === "onchain" ? a.method : autoMethod(chain);

  if (chain !== "lightning" && method === "lightning") return null;

  const processor = (typeof a.processor === "string" && a.processor.trim()) ? a.processor : "other";

  // ---- FIX: make evidence a string[] explicitly
  const evInput: string[] = Array.isArray(a.evidence)
    ? (a.evidence.filter((u: unknown) => typeof u === "string" && !!(u as string).trim()) as string[])
    : [];
  const evidence: string[] = Array.from(new Set<string>(evInput));

  const out: Accept = { asset, chain, method, processor };
  if (evidence.length) out.evidence = evidence;
  if (typeof a.last_verified === "string") out.last_verified = a.last_verified;
  if (typeof a.last_checked === "string") out.last_checked = a.last_checked;
  return out;
}

function rebuildPayment(place: any): any | undefined {
  const raw = place?.payment;
  const coins = place?.coins;

  // Seeds from legacy flags
  const seeds: Accept[] = [];
  if (raw && typeof raw === "object") {
    if (raw.lightning === true) {
      seeds.push({ asset: "BTC", chain: "lightning", method: "lightning", processor: "other" });
    }
    if (raw.onchain === true) {
      const fromCoins = coinsToOnchainAccepts(coins);
      if (fromCoins.length > 0) seeds.push(...fromCoins);
      else seeds.push({ asset: "BTC", chain: "bitcoin", method: "onchain", processor: "other" });
    }
  }

  // Accepts from any existing array
  const acceptsInput: any[] = [];
  if (raw && Array.isArray(raw.accepts)) acceptsInput.push(...raw.accepts);

  // Normalize + merge by asset+chain+processor
  const merged = new Map<string, Accept>();
  const push = (cand: any) => {
    const n = normalizeAccept(cand);
    if (!n) return;
    const key = `${n.asset}__${n.chain}__${n.processor || "other"}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, n);
    else {
      const mergedEv = new Set<string>([
        ...(prev.evidence || []),
        ...(n.evidence || [])
      ]);
      merged.set(key, {
        asset: prev.asset,
        chain: prev.chain,
        method: prev.method || n.method,
        processor: prev.processor || n.processor,
        evidence: Array.from(mergedEv),
        last_verified: prev.last_verified || n.last_verified,
        last_checked: prev.last_checked || n.last_checked
      });
    }
  };

  for (const s of seeds) push(s);
  for (const a of acceptsInput) push(a);

  // Build clean object; drop legacy keys like lightning/onchain/cash/credit_cards
  const clean: any = {};
  const accepts = Array.from(merged.values());
  if (accepts.length) clean.accepts = accepts;

  if (raw && Array.isArray(raw.preferred)) {
    clean.preferred = Array.from(
      new Set<string>(raw.preferred.filter((s: unknown) => typeof s === "string" && (s as string).trim()))
    );
  }
  if (raw && typeof raw.processor === "string" && raw.processor.trim()) clean.processor = raw.processor;
  if (raw && typeof raw.notes === "string" && raw.notes.trim()) clean.notes = raw.notes;

  return Object.keys(clean).length ? clean : undefined;
}

function discoverFiles(): string[] {
  const out = new Set<string>();
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const st = fs.statSync(q);
      if (st.isDirectory()) walk(q);
      else if (q.toLowerCase().endsWith(".json")) out.add(q);
    }
  };
  walk(path.join(ROOT, "public", "data", "places"));
  const top = path.join(ROOT, "public", "places.json");
  if (fs.existsSync(top)) out.add(top);
  return Array.from(out).sort();
}

function readJson(file: string) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function writeJson(file: string, data: any) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8"); }

function fixFile(file: string): { touched: boolean; removedPayment: number; rebuiltPayment: number } {
  const json = readJson(file);
  const list: any[] = Array.isArray(json)
    ? json
    : (json.places || json.items || json.results || json.data || json.entries || []);
  if (!Array.isArray(list)) return { touched: false, removedPayment: 0, rebuiltPayment: 0 };

  let touched = 0, removed = 0, rebuilt = 0;

  for (const r of list) {
    if (!r || typeof r !== "object") continue;

    // website: force to string|null
    if (Object.prototype.hasOwnProperty.call(r, "website") && typeof r.website !== "string" && r.website !== null) {
      r.website = null; touched++;
    }

    if (r.payment && typeof r.payment === "object") {
      // always drop legacy keys if they still exist
      delete r.payment.cash;
      delete r.payment.credit_cards;
      delete r.payment.lightning; // will be rebuilt via seeds
      delete r.payment.onchain;   // will be rebuilt via seeds

      const clean = rebuildPayment(r);
      if (!clean) { delete r.payment; removed++; touched++; }
      else {
        const before = JSON.stringify(r.payment);
        r.payment = clean;
        if (before !== JSON.stringify(clean)) { rebuilt++; touched++; }
      }
    }
  }

  if (touched > 0) {
    if (Array.isArray(json)) writeJson(file, list);
    else {
      if (json.places) json.places = list;
      else if (json.items) json.items = list;
      else if (json.results) json.results = list;
      else if (json.data) json.data = list;
      else if (json.entries) json.entries = list;
      writeJson(file, json);
    }
    console.log(`[fixed] ${file}`);
    return { touched: true, removedPayment: removed, rebuiltPayment: rebuilt };
  }
  return { touched: false, removedPayment: 0, rebuiltPayment: 0 };
}

function main() {
  const files = process.env.CPM_INPUT ? [path.resolve(process.env.CPM_INPUT)] : discoverFiles();
  let touchedFiles = 0, removed = 0, rebuilt = 0;
  for (const f of files) {
    const res = fixFile(f);
    if (res.touched) { touchedFiles++; removed += res.removedPayment; rebuilt += res.rebuiltPayment; }
  }
  console.log(`\nDone. files=${touchedFiles}, payments_removed=${removed}, payments_rebuilt=${rebuilt}`);
}
main();
