export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail, sanitizeUrl } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";

function splitList(input: string | null | undefined): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[\n,|]+/g)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20);
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
    const About            = sanitizeText(form.get("About") as string);

    const ExistingPlaceId  = sanitizeText(form.get("ExistingPlaceId") as string);

    const latRaw = (form.get("lat") as string) ?? "";
    const lngRaw = (form.get("lng") as string) ?? "";
    const lat = Number.isFinite(Number(latRaw)) ? Number(latRaw) : undefined;
    const lng = Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : undefined;

    /* ===== 支払い ===== */
    const AcceptedRaw      = sanitizeText(form.get("Accepted") as string);

    let PaymentNote        = sanitizeText(form.get("PaymentNote") as string);
    if (PaymentNote) PaymentNote = PaymentNote.slice(0, 150);

    const PaymentPages     = splitList(sanitizeText(form.get("PaymentPages") as string))
                              .map(u => sanitizeUrl(u) || u)
                              .filter(Boolean);

    /* ===== Amenities（notes 150 文字） ===== */
    const wifi        = form.get("wifi") ? "available" : undefined;
    const wheelchair  = form.get("wheelchair") ? "accessible" : undefined;
    const smoking     = form.get("smoking") ? "allowed" : undefined;
    const delivery    = form.get("delivery") ? "yes" : undefined;
    const takeaway    = form.get("takeaway") ? "yes" : undefined;
    const wifi_fee    = sanitizeText(form.get("wifi_fee") as string);

    let amenities_notes = sanitizeText(form.get("amenities_notes") as string);
    if (amenities_notes) amenities_notes = amenities_notes.slice(0, 150);

    /* ===== Socials ===== */
    const SocialsRaw       = splitList(sanitizeText(form.get("Socials") as string))
                              .map(s => s.startsWith("http") ? (sanitizeUrl(s) || s) : s)
                              .filter(Boolean);

    /* ===== 証憑 ===== */
    const Proof            = sanitizeText(form.get("Proof") as string);

    /* ===== 画像枚数 ===== */
    const galleryFiles = form.getAll("Gallery[]") as (File | string)[];
    const ImagesCount  = Array.isArray(galleryFiles) ? galleryFiles.length : 0;

    /* ===== 参照番号 ===== */
    const ref = makeRef("owner");

    /* ===== payload ===== */
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

      // 支払い
      AcceptedRaw,
      PaymentNote,
      PaymentPages,

      // ソーシャル
      SocialsRaw,

      // Amenities
      amenities: {
        wifi,
        wifi_fee,
        wheelchair,
        smoking,
        delivery,
        takeaway,
        notes: amenities_notes,
      },

      // 証憑
      Proof,

      // 画像
      ImagesCount,
    } as const;

    /* ===== メール送信 ===== */
    if (SubmitterEmail) {
      const mailUser = buildMail("user", "owner", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    const mailOps = buildMail("ops", "owner", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: mailOps.text });

    /* ===== ローカル保存（任意） ===== */
    if (process.env.SAVE_FILES === "1") {
      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const dir = path.join(process.cwd(), "public/_submissions/owner");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ref}.json`), JSON.stringify(payload, null, 2));
    }

    /* ===== 成功時リダイレクト ===== */
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
