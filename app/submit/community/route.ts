export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail, sanitizeUrl } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";

/** 改行 / カンマ / 縦棒 で分割してトリム */
function splitList(input: string | null | undefined): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[\n,|]+/g)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    /* ===== 基本情報 ===== */
    const Business        = sanitizeText(form.get("BusinessName") as string);
    const SubmitterName   = sanitizeText(form.get("SubmitterName") as string);
    const SubmitterEmail  = sanitizeEmail(form.get("SubmitterEmail") as string);

    const Country         = sanitizeText(form.get("Country") as string);
    const City            = sanitizeText(form.get("City") as string);
    const Address         = sanitizeText(form.get("Address") as string);

    const Category        = sanitizeText(form.get("Category") as string);
    const website         = sanitizeUrl(form.get("Website") as string) || undefined;

    const ExistingPlaceId = sanitizeText(form.get("ExistingPlaceId") as string) || undefined;

    /* ===== About / Summary（1項目・≤300） ===== */
    let About             = sanitizeText(form.get("About") as string) || "";
    if (About) About = About.slice(0, 300);
    const profile         = { summary: About.trim() };

    /* ===== 受入通貨 ===== */
    const AcceptedRaw     = sanitizeText(form.get("Accepted") as string);

    /* ===== Payments note（≤150） ===== */
    let PaymentNote       = sanitizeText(form.get("PaymentNote") as string) || "";
    if (PaymentNote) PaymentNote = PaymentNote.slice(0, 150);

    /* ===== Evidence（URLを最低2件） ===== */
    const EvidenceList    = splitList(sanitizeText(form.get("Evidence") as string))
                              .map(u => sanitizeUrl(u) || u)
                              .filter(Boolean);
    const EvidenceCount   = EvidenceList.length;
    if (EvidenceCount < 2) {
      return NextResponse.json({ error: "need at least 2 evidence links" }, { status: 400 });
    }

    /* ===== Amenities（テキスト1項目・≤150） ===== */
    let amenities_notes = sanitizeText(form.get("amenities_notes") as string) || "";
    if (amenities_notes) amenities_notes = amenities_notes.slice(0, 150);

    /* ===== 添付画像枚数 ===== */
    const galleryFiles = form.getAll("Gallery[]") as (File | string)[];
    const ImagesCount  = Array.isArray(galleryFiles) ? galleryFiles.length : 0;

    /* ===== 参照番号 ===== */
    const ref = makeRef("community");

    /* ===== payload ===== */
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

      // About/Summary（1項目）
      About,
      profile,

      AcceptedRaw,
      PaymentNote,

      Evidence: EvidenceList,
      EvidenceCount,

      // Amenities（テキストのみ）
      amenities: { notes: amenities_notes },

      ImagesCount,
    } as const;

    /* ===== メール送信 ===== */
    if (SubmitterEmail) {
      const mailUser = buildMail("user", "community", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    const mailOps = buildMail("ops", "community", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: mailOps.text });

    /* ===== ローカル保存（任意） ===== */
    if (process.env.SAVE_FILES === "1") {
      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const dir = path.join(process.cwd(), "public/_submissions/community");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ref}.json`), JSON.stringify(payload, null, 2));
    }

    /* ===== 成功時リダイレクト ===== */
    const url = new URL(req.url);
    url.pathname = "/forms/submitted.html"; // ← 修正: /submitted.html から /forms/submitted.html へ
    url.searchParams.set("kind", "community");
    url.searchParams.set("ref", ref);
    url.searchParams.set("name", Business || SubmitterName || "—");
    return NextResponse.redirect(url, 303);

  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to submit community" }, { status: 500 });
  }
}
