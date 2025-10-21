// app/submit/community/route.ts
import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const Business = sanitizeText(form.get("BusinessName") as string);
    const SubmitterName = sanitizeText(form.get("SubmitterName") as string);
    const SubmitterEmail = sanitizeEmail(form.get("SubmitterEmail") as string);
    const Country = sanitizeText(form.get("Country") as string);
    const City = sanitizeText(form.get("City") as string);
    const Category = sanitizeText(form.get("Category") as string);
    const AcceptedRaw = sanitizeText(form.get("Accepted") as string);
    const ImagesCount = Number(form.get("ImagesCount") ?? 0) || 0;
    const EvidenceCount = Number(form.get("EvidenceCount") ?? 0) || 0;

    // 仕様：Evidence 2未満なら 400（必要なら有効化）
    if (EvidenceCount < 2) {
      return NextResponse.json({ error: "need at least 2 evidence images" }, { status: 400 });
    }

    const ref = makeRef("community");
    const payload = {
      ref,
      when: new Date().toISOString(),
      Business, Country, City, Category, AcceptedRaw,
      ImagesCount, EvidenceCount,
      SubmitterName, SubmitterEmail,
    } as const;

    // user
    if (SubmitterEmail) {
      const mailUser = buildMail("user", "community", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    // ops
    const mailOps = buildMail("ops", "community", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: mailOps.text });

    if (process.env.SAVE_FILES === "1") {
      const dir = path.join(process.cwd(), "public/_submissions/community");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ref}.json`), JSON.stringify(payload, null, 2));
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
