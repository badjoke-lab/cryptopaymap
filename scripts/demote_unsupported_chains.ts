/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = process.argv[2] || "public/data/places";

// スキーマが許可しているチェーン（eip155:* を含めない）
const ALLOWED = new Set([
  "bitcoin","lightning","solana","tron","dogecoin","litecoin"
]);

type Accept = { asset: string; chain: string; processor?: string; evidence?: string[]; last_verified?: string; last_checked?: string; notes?: string; };

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

(function main() {
  const files = listJsonFiles(ROOT);
  let touched = 0, moved = 0;

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
      const accepts: Accept[] = Array.isArray(p.accepts) ? p.accepts : [];
      const keep: Accept[] = [];
      const drop: Accept[] = [];

      for (const a of accepts) {
        if (a && typeof a.chain === "string" && ALLOWED.has(a.chain)) keep.push(a);
        else drop.push(a);
      }

      if (drop.length) {
        place.payment = { ...p, accepts: keep };
        // pending_assets へ退避（重複排除）
        const pend = Array.isArray(place.pending_assets) ? place.pending_assets : [];
        for (const d of drop) {
          const asset_raw = (d?.asset ?? "").toString();
          const chain_raw = (d?.chain ?? "").toString();
          if (!asset_raw || !chain_raw) continue;
          const key = JSON.stringify({ asset_raw, chain_raw });
          if (!pend.some((x: any) => JSON.stringify({ asset_raw: x.asset_raw, chain_raw: x.chain_raw }) === key)) {
            pend.push({ asset_raw, chain_raw, notes: "demoted from accepts (unsupported chain by schema)" });
            moved++;
          }
        }
        place.pending_assets = pend;
        // preferred ⊆ accepts を維持
        if (Array.isArray(place.payment.preferred)) {
          const ok = new Set(keep.map(k => `${k.asset}@${k.chain}`));
          place.payment.preferred = place.payment.preferred.filter((s: any) => typeof s === "string" && ok.has(s));
        }
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(f, JSON.stringify(json, null, 2) + "\n", "utf8");
      console.log(`[demoted] ${f}`);
      touched++;
    }
  }

  console.log(`Done. files touched=${touched}, accepts->pending moved=${moved}`);
})();
