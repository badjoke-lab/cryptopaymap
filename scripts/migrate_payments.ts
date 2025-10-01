// scripts/migrate_payments.ts
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

type Accept = {
  asset: string;
  chain: string;
  method?: "onchain" | "lightning";
  processor?: string;
  evidence?: string[];
  last_verified?: string;
  last_checked?: string;
};

const ROOT = process.cwd();

const CHAIN_ALIASES: Record<string, string> = {
  // L1s
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
  // EVM
  eth: "eip155:1",
  ethereum: "eip155:1",
  polygon: "eip155:137",
  matic: "eip155:137",
  arbitrum: "eip155:42161",
  optimism: "eip155:10"
};

const isEvmId = (s: string) => /^eip155:\d+$/.test(s);

function normalizeChain(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const lower = input.trim().toLowerCase();
  if (CHAIN_ALIASES[lower]) return CHAIN_ALIASES[lower];
  if (isEvmId(lower)) return lower;
  return lower; // keep as-is; schema/validate may reject later
}

function autoMethod(chain: string): "onchain" | "lightning" {
  return chain === "lightning" ? "lightning" : "onchain";
}

function discoverTargets(): string[] {
  const out = new Set<string>();
  const walkJson = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d)) {
        const q = path.join(d, f);
        const st = fs.statSync(q);
        if (st.isDirectory()) walk(q);
        else if (q.toLowerCase().endsWith(".json")) out.add(q);
      }
    };
    walk(dir);
  };
  walkJson(path.join(ROOT, "public", "data", "places"));
  const top = path.join(ROOT, "public", "places.json");
  if (fs.existsSync(top)) out.add(top);
  return Array.from(out).sort();
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function mergeAccepts(list: Accept[]): Accept[] {
  // merge by asset+chain+processor; union evidence
  const map = new Map<string, Accept>();
  for (const a of list) {
    const key = `${a.asset}__${a.chain}__${a.processor || "other"}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, {
        asset: a.asset,
        chain: a.chain,
        method: a.method,
        processor: a.processor || "other",
        evidence: Array.isArray(a.evidence) ? Array.from(new Set(a.evidence)) : [],
        last_verified: a.last_verified,
        last_checked: a.last_checked
      });
    } else {
      const evidence = new Set<string>([
        ...(cur.evidence || []),
        ...(Array.isArray(a.evidence) ? a.evidence : [])
      ]);
      map.set(key, {
        asset: cur.asset,
        chain: cur.chain,
        method: cur.method || a.method,
        processor: cur.processor || a.processor || "other",
        evidence: Array.from(evidence),
        last_verified: cur.last_verified || a.last_verified,
        last_checked: cur.last_checked || a.last_checked
      });
    }
  }
  return Array.from(map.values());
}

function migratePlace(place: any): { changed: boolean; addedAccepts: number; addedPending: number } {
  let changed = false;
  let addedAccepts = 0;
  let addedPending = 0;

  place.payment = place.payment || {};
  const p = place.payment;
  p.accepts = Array.isArray(p.accepts) ? p.accepts : [];
  p.preferred = Array.isArray(p.preferred) ? p.preferred : [];

  // 1) Legacy booleans: payment.btc / payment.eth
  if (p.btc === true) {
    p.accepts.push({ asset: "BTC", chain: "bitcoin", method: "onchain", processor: "other" });
    delete p.btc;
    changed = true;
    addedAccepts++;
  }
  if (p.eth === true) {
    p.accepts.push({ asset: "ETH", chain: "eip155:1", method: "onchain", processor: "other" });
    delete p.eth;
    changed = true;
    addedAccepts++;
  }

  // 2) Legacy coins[] (string array)
  if (Array.isArray(place.coins)) {
    for (const c of place.coins) {
      const sym = String(c || "").trim().toUpperCase();
      if (!sym) continue;
      if (sym === "BTC") {
        p.accepts.push({ asset: "BTC", chain: "bitcoin", method: "onchain", processor: "other" });
        addedAccepts++;
      } else if (sym === "ETH") {
        p.accepts.push({ asset: "ETH", chain: "eip155:1", method: "onchain", processor: "other" });
        addedAccepts++;
      } else if (sym === "USDT" || sym === "USDC") {
        // Default to Ethereum mainnet when legacy had no chain info
        p.accepts.push({ asset: sym, chain: "eip155:1", method: "onchain", processor: "other" });
        addedAccepts++;
      } else {
        // Unknown legacy symbol → stash to pending_assets
        place.pending_assets = Array.isArray(place.pending_assets) ? place.pending_assets : [];
        place.pending_assets.push({ asset_raw: sym, chain_raw: "", sources: [] });
        addedPending++;
      }
    }
    // keep coins as legacy field for now (schema still allows it). Remove if you want:
    // delete place.coins;
    changed = true;
  }

  // 3) Normalize accepts (asset uppercase, chain strict id, method default)
  if (Array.isArray(p.accepts) && p.accepts.length > 0) {
    p.accepts = p.accepts
      .filter(Boolean)
      .map((a: any) => {
        const asset = String(a.asset || "").trim().toUpperCase();
        const chainRaw = a.chain ?? "";
        const chain = normalizeChain(chainRaw || "") || "";
        const method = a.method || autoMethod(chain);
        const processor = a.processor || "other";
        const evidence = Array.isArray(a.evidence) ? a.evidence.filter(Boolean) : [];
        return { asset, chain, method, processor, evidence, last_verified: a.last_verified, last_checked: a.last_checked } as Accept;
      })
      // drop invalid lightning combos (only BTC supports lightning)
      .filter((a: Accept) => !(a.chain === "lightning" && a.asset !== "BTC"));

    // merge duplicates
    p.accepts = mergeAccepts(p.accepts);
    changed = true;
  }

  // 4) Ensure arrays exist
  place.pending_assets = Array.isArray(place.pending_assets) ? place.pending_assets : [];

  return { changed, addedAccepts, addedPending };
}

function main() {
  const files = discoverTargets();
  if (files.length === 0) {
    console.log("No JSON targets found. Nothing to migrate.");
    process.exit(0);
  }

  let fileTouched = 0;
  let totalAccepts = 0;
  let totalPending = 0;

  for (const file of files) {
    const json = readJson(file);

    // Support array file or wrapped object
    const list: any[] = Array.isArray(json)
      ? json
      : (json.places || json.items || json.results || json.data || json.entries || []);

    if (!Array.isArray(list)) {
      // skip non-place files
      continue;
    }

    let changedThisFile = false;
    let addedA = 0;
    let addedP = 0;

    for (const place of list) {
      const { changed, addedAccepts, addedPending } = migratePlace(place);
      if (changed) changedThisFile = true;
      addedA += addedAccepts;
      addedP += addedPending;
    }

    if (changedThisFile) {
      // Write back preserving original top-level shape
      if (Array.isArray(json)) {
        writeJson(file, list);
      } else {
        if (json.places) json.places = list;
        else if (json.items) json.items = list;
        else if (json.results) json.results = list;
        else if (json.data) json.data = list;
        else if (json.entries) json.entries = list;
        writeJson(file, json);
      }
      fileTouched++;
      totalAccepts += addedA;
      totalPending += addedP;
      console.log(`[migrated] ${file}  (+accepts=${addedA}, +pending=${addedP})`);
    }
  }

  console.log(`\nDone. Files touched: ${fileTouched}, accepts added: ${totalAccepts}, pending added: ${totalPending}`);
}

main();
