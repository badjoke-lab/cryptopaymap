// scripts/validate.ts
/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

// -------- Config --------
const ROOT = process.cwd();
const SCHEMA_PATH = process.env.CPM_SCHEMA || path.join("schema", "place.schema.json");

// If you want to restrict to a single file, set CPM_INPUT. Otherwise we discover targets.
const SINGLE_INPUT = process.env.CPM_INPUT; // e.g. "public/places.json"

// -------- AJV --------
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// -------- Helpers --------
function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function collectJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const st = fs.statSync(q);
      if (st.isDirectory()) walk(q);
      else if (q.toLowerCase().endsWith(".json")) out.push(q);
    }
  };
  walk(dir);
  return out;
}

function discoverTargets(): string[] {
  if (SINGLE_INPUT) {
    return [path.resolve(SINGLE_INPUT)];
  }
  const set = new Set<string>();
  collectJsonFiles(path.join(ROOT, "public", "data", "places")).forEach((f) => set.add(f));
  const topLevel = path.join(ROOT, "public", "places.json");
  if (fs.existsSync(topLevel)) set.add(topLevel);
  return Array.from(set).sort();
}

// Media policy by verification level
function levelLimits(level: string | undefined) {
  if (level === "owner") return { maxImages: 8, maxCaption: 600 };
  if (level === "community") return { maxImages: 4, maxCaption: 300 };
  return { maxImages: 0, maxCaption: 0 }; // directory / unverified / undefined
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

// Known chain aliases → strict ids (internal storage ids)
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

// Normalize a chain string to the strict id (without mutating original data)
function normalizedChain(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const lower = input.trim().toLowerCase();
  if (CHAIN_ALIASES[lower]) return CHAIN_ALIASES[lower];
  if (isEvmId(lower)) return lower;
  return lower; // return as-is; schema may still reject it
}

// Payment business rules (without mutating source)
function validatePaymentRules(place: any, filePath: string, idx: number): string[] {
  const errs: string[] = [];

  const accepts: Accept[] = place?.payment?.accepts || [];
  if (!Array.isArray(accepts)) return errs;

  for (let i = 0; i < accepts.length; i++) {
    const a = accepts[i];
    const idLabel = `${path.basename(filePath)}[${idx}].payment.accepts[${i}]`;

    const asset = typeof a.asset === "string" ? a.asset.toUpperCase() : "";
    const chainNorm = normalizedChain(a.chain ?? "");

    // Require asset and chain per schema; here we only add semantic checks
    if (chainNorm === "lightning" && asset !== "BTC") {
      errs.push(`${idLabel}: lightning is only valid with asset=BTC`);
    }

    // method implied defaults (validation only; we don't mutate):
    // - chain=lightning -> method should be lightning (if present)
    // - otherwise -> method should be onchain (if present)
    if (a.method) {
      if (chainNorm === "lightning" && a.method !== "lightning") {
        errs.push(`${idLabel}: method must be 'lightning' when chain=lightning`);
      }
      if (chainNorm !== "lightning" && a.method === "lightning") {
        errs.push(`${idLabel}: method 'lightning' is invalid for chain='${chainNorm ?? a.chain}'`);
      }
    }

    // Optional: evidence URLs must be non-empty strings (AJV already checks format if schema set)
    if (a.evidence && !Array.isArray(a.evidence)) {
      errs.push(`${idLabel}: evidence must be an array of URLs`);
    }
  }

  return errs;
}

// Core media/profile policy
function validateBusinessRules(records: any[], filePath: string): string[] {
  const errs: string[] = [];

  records.forEach((r, i) => {
    const placeId = r.id || `#${i}`;
    const lvl = r?.verification?.status as string | undefined;
    const limits = levelLimits(lvl);

    // media limits
    const imgs = r?.media?.images || [];
    if (imgs.length > limits.maxImages) {
      errs.push(`${path.basename(filePath)}[${i} ${placeId}]: media.images length ${imgs.length} exceeds ${limits.maxImages} for level=${lvl}`);
    }
    if (imgs.length > 0 && limits.maxImages === 0) {
      errs.push(`${path.basename(filePath)}[${i} ${placeId}]: media.images not allowed for level=${lvl}`);
    }
    if (imgs.length > 0) {
      for (const img of imgs) {
        const cap = (img?.caption || "") as string;
        if (cap.length > limits.maxCaption) {
          errs.push(`${path.basename(filePath)}[${i} ${placeId}]: caption length ${cap.length} exceeds ${limits.maxCaption} for level=${lvl}`);
        }
      }
    }

    // profile allowed only for owner/community
    if (r.profile && !(lvl === "owner" || lvl === "community")) {
      errs.push(`${path.basename(filePath)}[${i} ${placeId}]: profile is not allowed for level=${lvl}`);
    }

    // payment rules
    errs.push(...validatePaymentRules(r, filePath, i));
  });

  return errs;
}

function main() {
  const schema = readJson(path.resolve(SCHEMA_PATH));
  const validate = ajv.compile(schema);

  const targets = discoverTargets();
  if (targets.length === 0) {
    console.log("No JSON targets found. Nothing to validate.");
    process.exit(0);
  }

  let schemaErrs = 0;
  let policyErrs = 0;
  let totalPlaces = 0;

  for (const file of targets) {
    const abs = path.resolve(file);
    const json = readJson(abs);

    // allow either array file or wrapped object with places/items/results/data/entries
    const records: any[] = Array.isArray(json)
      ? json
      : (json.places || json.items || json.results || json.data || json.entries || []);

    if (!Array.isArray(records)) {
      // If file is not a place list, skip silently (it might be summary or other data)
      continue;
    }

    // AJV schema validation (per place object)
    const thisSchemaErrors: string[] = [];
    for (const rec of records) {
      const ok = validate(rec);
      if (!ok) {
        const errs = (validate.errors || []).map(
          (e) => `${path.basename(file)}: ${e.instancePath || "/"} ${e.message}`
        );
        thisSchemaErrors.push(...errs);
      }
    }

    if (thisSchemaErrors.length > 0) {
      schemaErrs += thisSchemaErrors.length;
      console.error("\nSchema errors in", file);
      console.error(thisSchemaErrors.join("\n"));
    }

    // Business rules
    const br = validateBusinessRules(records, file);
    if (br.length > 0) {
      policyErrs += br.length;
      console.error("\nBusiness rule errors in", file);
      console.error(br.join("\n"));
    }

    totalPlaces += records.length;
  }

  if (schemaErrs + policyErrs > 0) {
    console.error(`\nValidation failed. Schema errors: ${schemaErrs}, Business rule errors: ${policyErrs}`);
    process.exit(1);
  }

  console.log(`OK: ${totalPlaces} records passed schema + business rules across ${targets.length} file(s).`);
}

main();
