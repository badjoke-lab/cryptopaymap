// scripts/fix_v2.ts
/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

// Allowed keys for payment root and accepts items
const PAYMENT_ALLOWED_KEYS = new Set(["accepts", "preferred", "processor", "notes"]);
const ACCEPT_ALLOWED_KEYS = new Set([
  "asset",
  "chain",
  "method",
  "processor",
  "evidence",
  "last_verified",
  "last_checked"
]);

// Chain aliases -> strict ids
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
  return k; // leave as-is (schema/validator may still flag)
};

function autoMethodFromChain(chain: string | null): "onchain" | "lightning" {
  return chain === "lightning" ? "lightning" : "onchain";
}

function discoverTargets(): string[] {
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

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

type Accept = {
  asset?: string;
  chain?: string;
  method?: "onchain" | "lightning";
  processor?: string;
  evidence?: string[];
  last_verified?: string;
  last_checked?: string;
};

function normalizeAccept(a: any): Accept | null {
  if (!a || typeof a !== "object") return null;
  const asset = typeof a.asset === "string" ? a.asset.trim().toUpperCase() : "";
  const chain = normChain(a.chain ?? "");
  if (!asset || !chain) return null;

  // Lightning must be BTC only
  if (chain === "lightning" && asset !== "BTC") return null;

  const method: "onchain" | "lightning" =
    a.method && (a.method === "lightning" || a.method === "onchain")
      ? a.method
      : autoMethodFromChain(chain);

  if (chain !== "lightning" && method === "lightning") return null;

  const processor =
    typeof a.processor === "string" && a.processor.trim()
      ? a.processor
      : "other";

  const evidence = Array.isArray(a.evidence)
    ? Array.from(new Set(a.evidence.filter((u: any) => typeof u === "string" && !!u.trim())))
    : [];

  const out: Accept = { asset, chain, method, processor };
  if (evidence.length) out.evidence = evidence;
  if (typeof a.last_verified === "string") out.last_verified = a.last_verified;
  if (typeof a.last_checked === "string") out.last_checked = a.last_checked;
  return out;
}

function sanitizePayment(obj: any): any | undefined {
  if (!obj || typeof obj !== "object") return undefined;

  // Legacy booleans -> accepts
  const legacyAccepts: Accept[] = [];
  if (obj.btc === true) legacyAccepts.push({ asset: "BTC", chain: "bitcoin", method: "onchain", processor: "other" });
  if (obj.eth === true) legacyAccepts.push({ asset: "ETH", chain: "eip155:1", method: "onchain", processor: "other" });

  // Normalize accepts[]
  const acceptsRaw: any[] = Array.isArray(obj.accepts) ? obj.accepts : [];
  const accepts: Accept[] = [];

  for (const entry of [...legacyAccepts, ...acceptsRaw]) {
    const n = normalizeAccept(entry);
    if (!n) continue;
    accepts.push(n);
  }

  // Merge duplicates (asset+chain+processor)
  const merged = new Map<string, Accept>();
  for (const a of accepts) {
    const key = `${a.asset}__${a.chain}__${a.processor}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, a);
    } else {
      const ev = new Set<string>([...(prev.evidence || []), ...(a.evidence || [])]);
      merged.set(key, {
        asset: a.asset,
        chain: a.chain,
        method: prev.method || a.method,
        processor: prev.processor || a.processor,
        evidence: Array.from(ev),
        last_verified: prev.last_verified || a.last_verified,
        last_checked: prev.last_checked || a.last_checked
      });
    }
  }

  // Build clean payment object with allowed keys only
  const clean: any = {};
  clean.accepts = Array.from(merged.values());
  if (Array.isArray(obj.preferred)) {
    clean.preferred = Array.from(new Set(obj.preferred.filter((s: any) => typeof s === "string" && s.trim())));
  }
  if (typeof obj.processor === "string" && obj.processor.trim()) {
    clean.processor = obj.processor;
  }
  if (typeof obj.notes === "string" && obj.notes.trim()) {
    clean.notes = obj.notes;
  }
  // Remove unknown keys: we DO NOT copy them

  return clean;
}

const ALLOWED_STATUSES = new Set(["owner", "community", "directory", "unverified"]);

function normalizeVerification(v: any) {
  if (!v || typeof v !== "object") return;
  if (typeof v.status === "string") {
    const s = v.status.trim().toLowerCase();
    if (ALLOWED_STATUSES.has(s)) v.status = s;
  }
}

function normalizeWebsite(place: any) {
  if (place.hasOwnProperty("website") && typeof place.website !== "string" && place.website !== null) {
    // Force to null when not a string
    place.website = null;
  }
}

function fixPlace(place: any): boolean {
  let changed = false;

  // verification.status normalization
  if (place.verification) {
    const before = place.verification.status;
    normalizeVerification(place.verification);
    if (before !== place.verification.status) changed = true;
  }

  // website normalization
  const wBefore = place.website;
  normalizeWebsite(place);
  if (wBefore !== place.website) changed = true;

  // payment cleanup
  if (place.payment && typeof place.payment === "object") {
    const clean = sanitizePayment(place.payment);
    if (clean) {
      // compare shallowly
      const before = JSON.stringify(place.payment);
      place.payment = clean;
      const after = JSON.stringify(place.payment);
      if (before !== after) changed = true;
    }
  }

  // profile removal when not allowed (optional: leave to validator)
  // (no-op here; keep as-is)

  return changed;
}

function main() {
  const files = (process.env.CPM_INPUT
    ? [path.resolve(process.env.CPM_INPUT)]
    : (function discover() {
        const s = new Set<string>();
        const walk = (d: string) => {
          if (!fs.existsSync(d)) return;
          for (const f of fs.readdirSync(d)) {
            const q = path.join(d, f);
            const st = fs.statSync(q);
            if (st.isDirectory()) walk(q);
            else if (q.toLowerCase().endsWith(".json")) s.add(q);
          }
        };
        walk(path.join(ROOT, "public", "data", "places"));
        const top = path.join(ROOT, "public", "places.json");
        if (fs.existsSync(top)) s.add(top);
        return Array.from(s).sort();
      })()
  );

  let touchedFiles = 0;
  let touchedPlaces = 0;

  for (const file of files) {
    const data = readJson(file);
    const list: any[] = Array.isArray(data)
      ? data
      : (data.places || data.items || data.results || data.data || data.entries || []);

    if (!Array.isArray(list)) continue;

    let changedFile = false;
    for (const p of list) {
      const c = fixPlace(p);
      if (c) {
        changedFile = true;
        touchedPlaces++;
      }
    }

    if (changedFile) {
      if (Array.isArray(data)) writeJson(file, list);
      else {
        if (data.places) data.places = list;
        else if (data.items) data.items = list;
        else if (data.results) data.results = list;
        else if (data.data) data.data = list;
        else if (data.entries) data.entries = list;
        writeJson(file, data);
      }
      touchedFiles++;
      console.log(`[fixed] ${file}`);
    }
  }

  console.log(`\nFix completed. Files touched=${touchedFiles}, places touched=${touchedPlaces}`);
}

main();
