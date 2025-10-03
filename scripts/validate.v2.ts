// scripts/validate.v2.ts — v2 validator (schema + business rules), no `method`
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const DIR = process.argv[2] || "public/data/places";
const SCHEMA = process.argv[3] || "schema/place.schema.v2.json";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
const validate = ajv.compile(schema);

function listJson(dir: string): string[] {
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

let records = 0, errs = 0, oks = 0;

for (const file of listJson(DIR)) {
  let data: any;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { console.error(`✖ invalid JSON: ${file}`); errs++; continue; }

  const arr = Array.isArray(data) ? data : (data.places || data.items || data.results || data.data || data.entries || []);
  if (!Array.isArray(arr)) continue;

  for (const place of arr) {
    records++;
    const ok = validate(place);
    if (!ok) {
      errs++;
      console.error(`✖ schema: ${file}`);
      for (const e of validate.errors || []) console.error("  -", e.instancePath, e.message);
      continue;
    }

    // Business rules (no `method`)
    const pay = place.payment || {};
    // 1) Lightning is BTC-only
    if (Array.isArray(pay.accepts)) {
      for (const a of pay.accepts) {
        if (a?.chain === "lightning" && a?.asset !== "BTC") {
          errs++; console.error(`✖ ${file}: non-BTC asset on 'lightning'`);
        }
        if (a?.asset === "BTC" && !(a?.chain === "bitcoin" || a?.chain === "lightning")) {
          errs++; console.error(`✖ ${file}: BTC must be on 'bitcoin' or 'lightning'`);
        }
      }
    }
    // 2) preferred must be subset of accepts
    if (Array.isArray(pay.preferred)) {
      const set = new Set<string>((pay.accepts || []).map((x: any) => `${x.asset}@${x.chain}`));
      for (const s of pay.preferred) {
        if (!/^[A-Z0-9]{2,10}@[a-z0-9-]+$/.test(s)) {
          errs++; console.error(`✖ ${file}: preferred format invalid (${s})`);
        } else if (!set.has(s)) {
          errs++; console.error(`✖ ${file}: preferred not found in accepts (${s})`);
        }
      }
    }

    if (errs === 0) oks++;
  }
}

console.log(`SUMMARY: records=${records} ok=${oks} err=${errs}`);
process.exit(errs ? 1 : 0);
