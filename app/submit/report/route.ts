// app/submit/report/route.ts
import { NextRequest } from "next/server";
import { Octokit } from "@octokit/rest";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

// ===== Env =====
const GITHUB_TOKEN      = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER      = process.env.GITHUB_OWNER!;
const GITHUB_REPO       = process.env.GITHUB_REPO!;
const GITHUB_BASE_BRANCH= process.env.GITHUB_BASE_BRANCH || "main";
// data/submissions/** に合わせる（scripts/importSubmissions.ts の期待に一致）
const SUBMISSIONS_DIR   = process.env.SUBMISSIONS_DIR || "data/submissions";

function nowISO() { return new Date().toISOString(); }
function pad(n: number) { return n.toString().padStart(2, "0"); }
function ymdhms() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function rand4() { return Math.random().toString(36).slice(2,6); }

function sanitizeText(v: any, max = 1000): string {
  if (!v) return "";
  let s = String(v);
  // 制御文字除去（改行は維持）
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  // HTMLタグっぽいものを落とす（単純フィルタ）
  s = s.replace(/<[^>]*>/g, "");
  // 末尾カット
  if (s.length > max) s = s.slice(0, max);
  return s.trim();
}
function sanitizeUrlList(v: any): string[] {
  if (!v) return [];
  const raw = String(v).split(/[, \n\r\t]+/g).map(s => s.trim()).filter(Boolean);
  const urls: string[] = [];
  for (const x of raw) {
    try {
      const u = new URL(x);
      if (u.protocol === "http:" || u.protocol === "https:") urls.push(u.toString());
    } catch { /* ignore */ }
  }
  // 重複除去
  return Array.from(new Set(urls));
}
function mimeOk(t: string) {
  return /^(image\/jpeg|image\/png|image\/webp)$/.test(t);
}
function cleanFilename(name: string) {
  const base = name.normalize("NFKC").replace(/[^\w\-.]+/g, "_");
  return base.slice(0, 80) || "image";
}

async function getBaseSha(octokit: Octokit) {
  const { data } = await octokit.git.getRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `heads/${GITHUB_BASE_BRANCH}`,
  });
  return data.object.sha;
}

async function ensureBranch(octokit: Octokit, branch: string, fromSha: string) {
  await octokit.git.createRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `refs/heads/${branch}`,
    sha: fromSha,
  });
}

type JsonLike = Record<string, any>;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // ===== read fields =====
    const submitterName  = sanitizeText(form.get("SubmitterName"), 80);
    const submitterEmail = sanitizeText(form.get("SubmitterEmail"), 120);
    const placeRefRaw    = sanitizeText(form.get("PlaceRef"), 300);
    const placeName      = sanitizeText(form.get("PlaceName"), 80);
    const issue          = sanitizeText(form.get("Issue"), 40);
    const details        = sanitizeText(form.get("Details"), 1000);
    const evidence       = sanitizeUrlList(form.get("Evidence"));
    const newCoins       = sanitizeText(form.get("NewCoins"), 120);
    const otherProposal  = sanitizeText(form.get("OtherProposal"), 800);
    const contact        = sanitizeText(form.get("Contact"), 120);
    const notes          = sanitizeText(form.get("ReporterNotes"), 1000);
    const consent        = String(form.get("Consent") || "").toLowerCase() === "on";

    if (!submitterName || !submitterEmail || !placeRefRaw || !issue || !details || !consent) {
      return badRequest("Missing required fields.");
    }

    // placeRef: URL or ID を許容（そのまま保存）
    const placeRef = placeRefRaw;

    // ===== files (Gallery[]) =====
    const fileEntries = form.getAll("Gallery[]");
    const files = Array.isArray(fileEntries) ? fileEntries : [];
    const picked = files.slice(0, MAX_IMAGES);

    type UploadMeta = { name: string; bytes: number; type: string; path: string };
    const uploads: UploadMeta[] = [];

    for (const f of picked) {
      if (!(f instanceof File)) continue;
      if (!mimeOk(f.type)) continue;
      if (f.size > MAX_IMAGE_BYTES) continue;
      uploads.push({
        name: cleanFilename(f.name || "image"),
        bytes: f.size,
        type: f.type || "application/octet-stream",
        path: "", // 後で決定
      });
    }

    // ===== build submission JSON =====
    const ref = `report-${ymdhms()}-${rand4()}`;
    const timestamp = nowISO();

    const submission: JsonLike = {
      kind: "report",
      meta: { kind: "report", ref, timestamp },
      submitter: {
        name: submitterName,
        email: submitterEmail,
        contact: contact || null,
      },
      place: {
        ref: placeRef,
        name: placeName || null,
      },
      report: {
        issue,
        details,
        notes: notes || null,
        new_coins: newCoins || null,
        other_proposal: otherProposal || null,
        evidence_urls: evidence,
        images: [] as Array<{ file: string; bytes: number; type: string }>,
      },
      verification: {
        // 既存スクリプトの取り回しを邪魔しない minimal 情報
        status: "unverified",
        sources: [{ type: "other", name: "report-submission", when: timestamp }],
      },
    };

    // ===== GitHub operations =====
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // 1) ベースSHA
    const baseSha = await getBaseSha(octokit);

    // 2) 作業ブランチを作成
    const branch = `submissions/report/${ref}`;
    await ensureBranch(octokit, branch, baseSha);

    // 3) 画像を先にコミット（あれば）
    //    data/submissions/report/media/<ref>/filename
    for (let i = 0; i < uploads.length; i++) {
      const f = picked[i] as File;
      const meta = uploads[i];
      const arrayBuf = await f.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString("base64");
      const mediaPath = `${SUBMISSIONS_DIR}/report/media/${ref}/${meta.name}`;

      await octokit.repos.createOrUpdateFileContents({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        path: mediaPath,
        message: `chore(report): add media ${meta.name} for ${ref}`,
        content: b64,
        branch,
      });

      meta.path = mediaPath;
      submission.report.images.push({ file: mediaPath, bytes: meta.bytes, type: meta.type });
    }

    // 4) JSONをコミット
    const jsonPath = `${SUBMISSIONS_DIR}/report/${ref}.json`;
    const jsonContent = Buffer.from(JSON.stringify(submission, null, 2)).toString("base64");
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: jsonPath,
      message: `feat(report): ${placeName || placeRef} (${issue}) — ${ref}`,
      content: jsonContent,
      branch,
    });

    // 5) PRを作成
    const title = `[report] ${placeName || placeRef} — ${issue}`;
    const bodyLines = [
      `### Report submission`,
      ``,
      `**Ref**: \`${ref}\``,
      `**Place**: ${placeName || "(unknown)"} / ${placeRef}`,
      `**Issue**: ${issue}`,
      ``,
      `**Details**`,
      "```",
      details,
      "```",
      ...(notes ? [`**Reporter Notes**`, "```", notes, "```"] : []),
      ...(evidence.length ? [`**Evidence URLs**`, ...evidence.map(u => `- ${u}`)] : []),
      ``,
      `**Files**`,
      `- JSON: \`${jsonPath}\``,
      ...submission.report.images.map(im => `- ${im.file} (${im.type}, ${im.bytes} bytes)`),
      ``,
      `> Created by web form (report).`,
    ];

    const pr = await octokit.pulls.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title,
      head: branch,
      base: GITHUB_BASE_BRANCH,
      body: bodyLines.join("\n"),
    });

    // 6) 送信後の確認画面（HTML）を返す
    const html = successHtml({
      ref,
      title,
      prNumber: pr.data.number,
      prUrl: pr.data.html_url,
      placeName: placeName || "",
      placeRef,
      issue,
    });
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });

  } catch (e: any) {
    console.error("[report] submit error", e);
    return new Response(errorHtml(e?.message || "Unexpected error."), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// ===== helpers =====

function badRequest(msg: string) {
  return new Response(errorHtml(msg), {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function esc(s: string) {
  return String(s || "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]!));
}

function successHtml(p: { ref: string; title: string; prNumber: number; prUrl: string; placeName: string; placeRef: string; issue: string; }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Report submitted — CryptoPayMap</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="/forms/forms.css" />
<style>
.card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#fff; }
.row { margin: 8px 0; }
.small { color:#6b7280; font-size:12px; }
.prlink { display:inline-block; margin-top:8px; }
</style>
</head>
<body>
<main class="container">
  <h1>Thank you — Report received</h1>
  <div class="card">
    <div class="row"><strong>Ref</strong>: ${esc(p.ref)}</div>
    <div class="row"><strong>Place</strong>: ${esc(p.placeName || "(unknown)")} / ${esc(p.placeRef)}</div>
    <div class="row"><strong>Issue</strong>: ${esc(p.issue)}</div>
    <div class="row"><strong>PR</strong>: <a class="prlink" href="${esc(p.prUrl)}" target="_blank" rel="noopener">#${p.prNumber} — ${esc(p.title)}</a></div>
    <div class="small">You can track the review progress on the pull request.</div>
  </div>
  <p style="margin-top:16px;">
    <a class="btn" href="/forms/report.html">Submit another report</a>
    <a class="btn secondary" href="/">Back to map</a>
  </p>
</main>
</body>
</html>`;
}

function errorHtml(msg: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Submission error — CryptoPayMap</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="/forms/forms.css" />
</head>
<body>
<main class="container">
  <h1>Submission failed</h1>
  <p>${esc(msg)}</p>
  <p><a class="btn" href="/forms/report.html">Back to Report form</a></p>
</main>
</body>
</html>`;
}
