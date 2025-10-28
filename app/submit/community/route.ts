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
function splitList(input: string | null | undefined, cap=50): string[] {
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

    const Business        = sanitizeText(form.get("BusinessName") as string);
    const SubmitterName   = sanitizeText(form.get("SubmitterName") as string);
    const SubmitterEmail  = sanitizeEmail(form.get("SubmitterEmail") as string);

    const Country         = sanitizeText(form.get("Country") as string);
    const City            = sanitizeText(form.get("City") as string);
    const Address         = sanitizeText(form.get("Address") as string);

    const Category        = sanitizeText(form.get("Category") as string);
    const website         = sanitizeUrl(form.get("Website") as string) || undefined;
    const ExistingPlaceId = sanitizeText(form.get("ExistingPlaceId") as string) || undefined;

    /* About（≤300） */
    let About             = sanitizeText(form.get("About") as string) || "";
    if (About) About = About.slice(0, 300);

    /* Accepted */
    const AcceptedRaw     = sanitizeText(form.get("Accepted") as string);

    /* PaymentNote (≤150) */
    let PaymentNote       = sanitizeText(form.get("PaymentNote") as string) || "";
    if (PaymentNote) PaymentNote = PaymentNote.slice(0, 150);

    /* Evidence (>=2) */
    const EvidenceList    = splitList(sanitizeText(form.get("Evidence") as string))
                              .map(u => sanitizeUrl(u) || u)
                              .filter(Boolean);
    if (EvidenceList.length < 2) {
      return NextResponse.json({ error: "need at least 2 evidence links" }, { status: 400 });
    }

    /* Amenities */
    let amenities_notes   = sanitizeText(form.get("amenities_notes") as string) || "";
    if (amenities_notes) amenities_notes = amenities_notes.slice(0, 150);

    /* images */
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

    /* ref */
    const ref = makeRef("community");

    /* payload */
    const payload = {
      ref,
      when: new Date().toISOString(),

      Business,
      SubmitterName,
      SubmitterEmail,

      Country,
      City,
      Address,
      website,
      ExistingPlaceId,

      Category,
      About,
      AcceptedRaw,
      PaymentNote,

      Evidence: EvidenceList,
      EvidenceCount: EvidenceList.length,

      amenities: { notes: amenities_notes },

      ImagesCount: imagesLocal.length,
      images: imagesLocal.map(f => `public/pending/${ref}/${f.filename}`),

      verification: { status: "pending", receivedBy: "form", receivedAt: new Date().toISOString() },
    } as const;

    /* GitHub: branch → files → PR */
    const { ok, owner, repo, base } = getOctokit();
    const { data: baseRef } = await ok.git.getRef({ owner, repo, ref: `heads/${base}` });
    const baseSha = baseRef.object.sha;

    const branch = `submissions/${ref}`;
    await ok.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseSha });

    for (const img of imagesLocal) {
      await ok.repos.createOrUpdateFileContents({
        owner, repo, branch,
        path: `public/pending/${ref}/${img.filename}`,
        message: `chore(submission ${ref}): add ${img.filename}`,
        content: img.buf.toString("base64")
      });
    }
    const metaBuf = Buffer.from(JSON.stringify(payload, null, 2));
    await ok.repos.createOrUpdateFileContents({
      owner, repo, branch,
      path: `public/pending/${ref}/meta.json`,
      message: `chore(submission ${ref}): add meta.json`,
      content: metaBuf.toString("base64")
    });

    const prTitle = `Submission (community): ${Business || "—"} [${ref}]`;
    const prBody  =
`New community submission pending review.

- Ref: **${ref}**
- Kind: community
- Evidence: ${EvidenceList.length} links
- Folder: \`public/pending/${ref}/\`
`;
    const { data: pr } = await ok.pulls.create({
      owner, repo, title: prTitle, head: branch, base, body: prBody
    });

    /* mails */
    const opsExtra =
      `\n\n[Ref] ${ref}\n[PR] ${pr.html_url}\n[Pending folder] public/pending/${ref}/\n` +
      (imagesLocal.length ? imagesLocal.map((x,i)=>`  [${i+1}] ${x.filename}`).join("\n") : "  (no images)");
    const mailOps = buildMail("ops", "community", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: (mailOps.text || "") + opsExtra });

    if (SubmitterEmail) {
      const mailUser = buildMail("user", "community", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    const url = new URL(req.url);
    url.pathname = "/submitted.html";
    url.searchParams.set("kind", "community");
    url.searchParams.set("ref", ref);
    url.searchParams.set("name", Business || SubmitterName || "—");
    return NextResponse.redirect(url, 303);

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to submit community" }, { status: 500 });
  }
}
