import fs from "node:fs";
import { normalizeOwnerForm } from "../src/normalizeSubmission";

const chainsMeta = JSON.parse(fs.readFileSync("chains.meta.json","utf8"));
const lines = fs.readFileSync("fixtures/payments.txt","utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

const input = {
  business_name: "Fuzz Test",
  address: "N/A",
  payments: lines.join("\n"),
  owner_proof: "N/A"
};

const { patch, rejects } = normalizeOwnerForm(input as any, chainsMeta);
const accepts = patch.payment?.accepts || [];
const hasBad = accepts.some(a => String(a.chain).startsWith("eip155:"));

if (hasBad) {
  console.error("FAIL: leaked eip155:* in output");
  process.exit(2);
}
const nonBtcLightning = accepts.filter(a => a.chain === "lightning" && a.asset !== "BTC");
if (nonBtcLightning.length) {
  console.error("FAIL: non-BTC Lightning was accepted");
  process.exit(3);
}

console.log(`Accepted ${accepts.length} lines, Rejected ${rejects.length}`);
for (const r of rejects) console.log(`REJECT: ${r.raw} -> ${r.reason}`);
console.log("OK");
