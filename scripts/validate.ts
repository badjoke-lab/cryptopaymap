// /scripts/validate.ts
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const PLACES = process.env.CPM_INPUT || "public/places.json";
const SCHEMA = process.env.CPM_SCHEMA || "schema/place.schema.json";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function readJson(p: string) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function softFail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function levelLimits(level: string) {
  if (level === "owner") return { maxImages: 8, maxCaption: 600 };
  if (level === "community") return { maxImages: 4, maxCaption: 300 };
  return { maxImages: 0, maxCaption: 0 }; // directory/unverified
}

function validateBusinessRules(records: any[]) {
  const errs: string[] = [];
  records.forEach((r, i) => {
    const id = r.id || `#${i}`;
    const lvl = r.verification?.status;
    const limits = levelLimits(lvl);

    const imgs = r.media?.images || [];
    if (imgs.length > limits.maxImages) {
      errs.push(`${id}: level=${lvl} images=${imgs.length} > ${limits.maxImages}`);
    }
    if (imgs.length > 0 && limits.maxImages === 0) {
      errs.push(`${id}: level=${lvl} must not have media.images`);
    }
    if (imgs.length > 0) {
      for (const img of imgs) {
        const cap = img.caption || "";
        if (cap.length > limits.maxCaption) {
          errs.push(`${id}: caption length ${cap.length} > ${limits.maxCaption} (level=${lvl})`);
        }
      }
    }
    if (r.profile && !(lvl === "owner" || lvl === "community")) {
      errs.push(`${id}: profile exists but level=${lvl}`);
    }
  });
  return errs;
}

function main() {
  const schema = readJson(SCHEMA);
  const validate = ajv.compile(schema);
  const places = readJson(PLACES);

  if (!Array.isArray(places)) softFail("places.json must be an array");
  const schemaErrors: string[] = [];
  for (const p of places) {
    const ok = validate(p);
    if (!ok) schemaErrors.push(...(validate.errors || []).map(e => `${p.id || "unknown"}: ${e.instancePath} ${e.message}`));
  }
  if (schemaErrors.length) {
    console.error("Schema errors:");
    console.error(schemaErrors.join("\n"));
    process.exit(1);
  }

  const ruleErrors = validateBusinessRules(places);
  if (ruleErrors.length) {
    console.error("Business rule errors:");
    console.error(ruleErrors.join("\n"));
    process.exit(1);
  }

  console.log(`OK: ${places.length} records passed schema + business rules`);
}
main();
