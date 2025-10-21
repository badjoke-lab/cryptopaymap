// app/submit/owner/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail, sanitizeUrl } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";

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
    const website = sanitizeUrl(form.get("Website") as string); // 使うなら payload に追加可
    const ownerVerifyUrl = sanitizeUrl(form.get("OwnerVerifyUrl") as string) || undefined;

    const ref = makeRef("owner");

    const payload = {
      ref,
      when: new Date().toISOString(),
      Business,
      Country,
      City,
      Category,
      AcceptedRaw,
      ImagesCount: Number(form.get("ImagesCount") ?? 0) || 0,
      SubmitterName,
      SubmitterEmail,
      owner_verify_url: ownerVerifyUrl,
    } as const;

    // user
    if (SubmitterEmail) {
      const mailUser = buildMail("user", "owner", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    // ops
    const mailOps = buildMail("ops", "owner", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: mailOps.text });

    // optional: local-only save（Vercel本番では無効想定）— SAVE_FILES=1 の時のみ
    if (process.env.SAVE_FILES === "1") {
      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const dir = path.join(process.cwd(), "public/_submissions/owner");
      fs.mkdirSync(dir, { recursive: true });
      // website を保存に含めたい場合は payload を展開して追記
      fs.writeFileSync(
        path.join(dir, `${ref}.json`),
        JSON.stringify({ ...payload, website }, null, 2)
      );
    }

    // 成功 → submitted.html にリダイレクト（クエリで ref と name）
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
