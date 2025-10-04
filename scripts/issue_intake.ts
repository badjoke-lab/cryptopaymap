// scripts/issue_intake.ts
import fs from "node:fs";
import path from "node:path";
import { normalizeOwnerForm, normalizeCommunityForm, normalizeReportForm } from "../src/normalizeSubmission";
import type { ChainsMeta } from "../src/normalizeSubmission";

function eventPayload(): any {
  const p = process.env.GITHUB_EVENT_PATH!;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function parseBlocks(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  let cur: string | null = null, buf: string[] = [];
  const flush = () => { if (cur) out[cur] = buf.join("\n").trim(); cur = null; buf = []; };
  for (const line of String(md || "").split(/\r?\n/)) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) { flush(); cur = m[1].trim().toLowerCase(); continue; }
    if (cur) buf.push(line);
  }
  flush(); return out;
}
function pickOwner(f: Record<string,string>) {
  return {
    business_name: f["business name"] || f["store name"] || "",
    address: f["address"] || "",
    website: (f["official website url"] || "").trim(),
    payments: f["accepted crypto (assets/chains)"] || f["assets"] || "",
    payment_pages: f["payment page / instructions urls"] || f["evidence"] || "",
    owner_proof: f["ownership proof (pick one)"] || f["owner proof"] || "",
    profile_summary: f["profile summary (for map card)"] || "",
    gallery_urls: f["image urls (up to 8)"] || f["gallery urls"] || "",
    socials: f["socials"] || ""
  };
}
function pickCommunity(f: Record<string,string>) {
  return {
    business_name: f["business name"] || f["store name"] || "",
    address: f["address"] || "",
    website: (f["official website url"] || "").trim(),
    payments: f["accepted crypto (assets/chains)"] || f["assets"] || "",
    evidence_urls: f["evidence urls"] || f["evidence"] || "",
    profile_summary: f["profile summary (for map card)"] || "",
    gallery_urls: f["image urls (up to 4)"] || "",
    socials: f["socials"] || ""
  };
}
function pickReport(f: Record<string,string>) {
  return {
    place_id_or_url: f["place id or url"] || f["target place id/url"] || "",
    details: f["details"] || f["what is wrong?"] || "",
    proposed_status: /disputed/i.test(f["proposed status"] || "") ? "disputed" : /hidden/i.test(f["proposed status"] || "") ? "hidden" : undefined,
    evidence_urls: f["evidence urls"] || f["evidence"] || "",
    images: f["images"] || ""
  };
}
function readChainsMeta(): ChainsMeta {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "chains.meta.json"), "utf8"));
}
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }

function main() {
  const ev = eventPayload();
  const issue = ev.issue;
  const labels: string[] = (issue.labels || []).map((l: any) => (l.name || "").toLowerCase());
  const body: string = String(issue.body || "");
  const fields = parseBlocks(body);
  const nowISO = new Date().toISOString();
  const chainsMeta = readChainsMeta();

  let result: { patch: any; rejects: Array<{ raw: string; reason: string }> };
  if (labels.includes("owner")) result = normalizeOwnerForm(pickOwner(fields), chainsMeta, nowISO);
  else if (labels.includes("community")) result = normalizeCommunityForm(pickCommunity(fields), chainsMeta, nowISO);
  else if (labels.includes("report")) result = normalizeReportForm(pickReport(fields), nowISO);
  else { console.log("No owner/community/report label. Skip."); return; }

  const sdir = path.join(process.cwd(), "inbox/submissions");
  const rdir = path.join(process.cwd(), "inbox/rejects");
  ensureDir(sdir); ensureDir(rdir);

  const pfile = path.join(sdir, `issue-${issue.number}.json`);
  fs.writeFileSync(pfile, JSON.stringify(result.patch, null, 2) + "\n");

  if (result.rejects && result.rejects.length) {
    const rfile = path.join(rdir, `issue-${issue.number}.json`);
    fs.writeFileSync(rfile, JSON.stringify({ rejects: result.rejects }, null, 2) + "\n");
  }

  console.log(`Wrote ${pfile} (${result.rejects?.length || 0} rejects)`);
}

main();
