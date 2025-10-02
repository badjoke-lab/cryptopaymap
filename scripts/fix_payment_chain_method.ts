// scripts/fix_payment_chain_method.ts
import fs from "fs";
import path from "path";

const ROOT = "public/data/places";

type Accept = {
  asset?: string;   // BTC / ETH / USDT ...
  chain?: string;   // bitcoin / evm / solana / tron / other
  method?: string;  // onchain / lightning / other
  evidence?: string[];
};

function norm(s: any): string {
  return String(s || "").trim().toLowerCase();
}

function normalizeChainMethod(a: Accept): Accept {
  const out: Accept = { ...a };
  const asset = norm(a.asset);
  const chain = norm(a.chain);
  const method = norm(a.method);

  const isLightning =
    chain === "lightning" || chain === "ln" || chain === "lnurl" ||
    method === "lightning" || asset === "lightning";
  const isBitcoinish =
    chain === "btc" || chain === "bitcoin" || asset === "btc" || asset === "bitcoin";
  const isEVMish =
    ["eth","ethereum","evm","erc20","polygon","matic","bsc","binance smart chain","op","optimism","arb","arbitrum","base","fantom","avax","avalanche"].includes(chain) ||
    ["eth","ethereum","usdt","usdc","dai","wbtc","matic"].includes(asset);
  const isSol = chain === "sol" || chain === "solana";
  const isTron = chain === "tron" || chain === "trc20";

  if (isLightning) {
    out.chain = "bitcoin";
    out.method = "lightning";
  } else if (isBitcoinish) {
    out.chain = "bitcoin";
    if (!out.method) out.method = "onchain";
  } else if (isEVMish) {
    out.chain = "evm";
    if (!out.method) out.method = "onchain";
  } else if (isSol) {
    out.chain = "solana";
    if (!out.method) out.method = "onchain";
  } else if (isTron) {
    out.chain = "tron";
    if (!out.method) out.method = "onchain";
  } else {
    if (!out.chain) out.chain = "other";
    if (!out.method) out.method = "other";
  }

  return out;
}

function loadJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function saveJson(p: string, j: any) {
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n", "utf8");
}

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f);
      const s = fs.statSync(q);
      if (s.isDirectory()) stack.push(q);
      else if (q.endsWith(".json")) out.push(q);
    }
  }
  return out;
}

function fixFile(file: string): boolean {
  const j = loadJson(file);
  const arr: any[] = Array.isArray(j) ? j : (j.places || j.items || j.results || j.data || j.entries || []);
  if (!Array.isArray(arr) || arr.length === 0) return false;

  let changed = false;
  for (const r of arr) {
    const pay = r?.payment;
    if (!pay || typeof pay !== "object") continue;
    const accepts: Accept[] = Array.isArray(pay.accepts) ? pay.accepts : [];
    if (accepts.length === 0) continue;

    const fixed = accepts.map(normalizeChainMethod);
    if (JSON.stringify(accepts) !== JSON.stringify(fixed)) {
      r.payment.accepts = fixed;
      changed = true;
    }
  }

  if (changed) {
    if (Array.isArray(j)) saveJson(file, arr);
    else {
      if (j.places) j.places = arr;
      else if (j.items) j.items = arr;
      else if (j.results) j.results = arr;
      else if (j.data) j.data = arr;
      else if (j.entries) j.entries = arr;
      saveJson(file, j);
    }
  }
  return changed;
}

function main() {
  const files = listJsonFiles(ROOT);
  let touched = 0;
  for (const f of files) {
    if (fixFile(f)) {
      touched++;
      console.log("[payment-fixed]", f);
    }
  }
  console.log(`Done. files=${files.length}, payment_fixed=${touched}`);
}

main();
