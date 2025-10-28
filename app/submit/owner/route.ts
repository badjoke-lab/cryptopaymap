export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail, sanitizeUrl } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";
import { Octokit } from "@octokit/rest";

/* ===== GitHub client ===== */
function getOctokit(){
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;
  const base  = process.env.GITHUB_DEFAULT_BRANCH || "main";
  if(!token || !owner || !repo) throw new Error("GITHUB_* env missing");
  const ok = new Octokit({ auth: token });
  return { ok, owner, repo, base };
}

/* ===== helpers ===== */
function splitList(input: string | null | undefined, cap=20): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  return raw.split(/[\n,|]+/g).map(s => s.trim()).filter(Boolean).slice(0, cap);
}
function fileExt(name = "", fallback = ".jpg") {
  const m = name.match(/\.[a-zA-Z0-9]{1,6}$/);
  return m ? m[0].toLowerCase() : fallback;
}
async function fileToBuffer(f: File): Promise<Buffer>{
  const arr = await f.arrayBuffer();
  return Buffer.from(arr);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    /* ===== 基本情報 ===== */
    const Business         = sanitizeText(form.get("BusinessName") as string);
    const SubmitterName    = sanitizeText(form.get("SubmitterName") as string);
    const SubmitterEmail   = sanitizeEmail(form.get("SubmitterEmail") as string);

    const Country          = sanitizeText(form.get("Country") as string);
    const CountryCode      = sanitizeText(form.get("CountryCode") as string);
    const City             = sanitizeText(form.get("City") as string);
    const Address          = sanitizeText(form.get("Address") as string);

    const Category         = sanitizeText(form.get("Category") as string);
    const CategoryOther    = sanitizeText(form.get("CategoryOther") as string);

    const website          = sanitizeUrl(form.get("Website") as string) || undefined;
    const Phone            = sanitizeText(form.get("Phone") as string);
    const Hours            = sanitizeText(form.get("Hours") as string);

    /* ===== About（≤600） ===== */
    let About              = sanitizeText(form.get("About") as string) || "";
    if (About) About = About.slice(0, 600);

    const ExistingPlaceId  = sanitizeText(form.get("ExistingPlaceId") as string);

    const latRaw = (form.get("lat") as string) ?? "";
    const lngRaw = (form.get("lng") as string) ?? "";
    const lat = Number.isFinite(Number(latRaw)) ? Number(latRaw) : undefined;
    const lng = Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : undefined;

    /* ===== 支払い ===== */
    const AcceptedRaw      = sanitizeText(form.get("Accepted") as string);

    let PaymentNote        = sanitizeText(form.get("PaymentNote") as string) || "";
    if (PaymentNote) PaymentNote = PaymentNote.slice(0, 150);

    const PaymentPages     = splitList(sanitizeText(form.get("PaymentPages") as string))
                              .map(u => sanitizeUrl(u) || u)
                              .filter(Boolean);

    /* ===== Amenities（テキスト・≤150） ===== */
    let amenities_notes    = sanitizeText(form.get("amenities_notes") as string) || "";
    if (amenities_notes) amenities_notes = amenities_notes.slice(0, 150);

    /* ===== Socials ===== */
    const SocialsRaw       = splitList(sanitizeText(form.get("Socials") as string))
                              .map(s => s.startsWith("http") ? (sanitizeUrl(s) || s) : s)
                              .filter(Boolean);

    /* ===== 証憑 ===== */
    const Proof            = sanitizeText(form.get("Proof") as string);

    /* ===== 画像収集 ===== */
    const galleryFiles = form.getAll("Gallery[]") as (File | string)[];
    const imagesLocal: {filename: string, buf: Buffer, contentType: string}[] = [];
    for (let i = 0; i < galleryFiles.length; i++) {
      const f = galleryFiles[i] as any;
      if (!f || typeof f === "string") continue;
      const ext = fileExt((f as File).name);
      const ctype = (f as File).type || "image/jpeg";
      const buf = await fileToBuffer(f as File);
      imagesLocal.push({ filename: `gallery-${i+1}${ext}`, buf, contentType: ctype });
    }

    /* ===== 参照番号 ===== */
    const ref = makeRef("owner");

    /* ===== payload (pending meta) ===== */
    const payload = {
      ref,
      when: new Date().toISOString(),

      Business,
      SubmitterName,
      SubmitterEmail,

      Country, CountryCode,
      City, Address,
      lat, lng,

      Category, CategoryOther,

      website,
      Phone,
      Hours,

      About,
      ExistingPlaceId,

      AcceptedRaw,
      PaymentNote,
      PaymentPages,

      SocialsRaw,

      amenities: { notes: amenities_notes },

      Proof,

      ImagesCount: imagesLocal.length,
      images: imagesLocal.map(f => `public/pending/${ref}/${f.filename}`),

      verification: { status: "pending", receivedBy: "form", receivedAt: new Date().toISOString() },
    } as const;

    /* ===== GitHub: 新規ブランチ作成 → ファイル追加 → PR作成 ===== */
    const { ok, owner, repo, base } = getOctokit();
    // 1) base の latest SHA 取得
    const { data: baseRef } = await ok.git.getRef({ owner, repo, ref: `heads/${base}` });
    const baseSha = baseRef.object.sha;

    const branch = `submissions/${ref}`;
    // 2) ブランチ作成
    await ok.git.createRef({
      owner, repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha
    });

    // 3) 画像と meta.json を順次コミット（createOrUpdateFileContents を複数回）
    // 画像
    for (const img of imagesLocal) {
      await ok.repos.createOrUpdateFileContents({
        owner, repo, branch,
        path: `public/pending/${ref}/${img.filename}`,
        message: `chore(submission ${ref}): add ${img.filename}`,
        content: img.buf.toString("base64")
      });
    }
    // meta.json
    const metaBuf = Buffer.from(JSON.stringify(payload, null, 2));
    await ok.repos.createOrUpdateFileContents({
      owner, repo, branch,
      path: `public/pending/${ref}/meta.json`,
      message: `chore(submission ${ref}): add meta.json`,
      content: metaBuf.toString("base64")
    });

    // 4) PR 作成
    const prTitle = `Submission (owner): ${Business || "—"} [${ref}]`;
    const prBody  =
`New owner submission pending review.

- Ref: **${ref}**
- Kind: owner
- Images: ${imagesLocal.length}
- Folder: \`public/pending/${ref}/\`

After review, run your promote script (or use GH Actions) to publish to \`public/data/places\`.
`;
    const { data: pr } = await ok.pulls.create({
      owner, repo, title: prTitle, head: branch, base, body: prBody
    });

    /* ===== メール送信（PR URL を明記） ===== */
    const opsExtra =
      `\n\n[Ref] ${ref}\n[PR] ${pr.html_url}\n[Pending folder] public/pending/${ref}/\n` +
      (imagesLocal.length ? imagesLocal.map((x,i)=>`  [${i+1}] ${x.filename}`).join("\n") : "  (no images)");
    const mailOps = buildMail("ops", "owner", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: (mailOps.text || "") + opsExtra });

    if (SubmitterEmail) {
      const mailUser = buildMail("user", "owner", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    /* ===== リダイレクト ===== */
    const url = new URL(req.url);
    url.pathname = "/submitted.html";
    url.searchParams.set("kind", "owner");
    url.searchParams.set("ref", ref);
    url.searchParams.set("name", Business || SubmitterName || "—");
    return NextResponse.redirect(url, 303);

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to submit owner" }, { status: 500 });
  }
}
