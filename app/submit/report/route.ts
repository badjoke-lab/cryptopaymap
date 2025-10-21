// app/submit/report/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail } from "@/lib/sanitize";
import { makeRef } from "@/lib/ref";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const SubmitterName = sanitizeText(form.get("SubmitterName") as string) || "Anonymous";
    const SubmitterEmail = sanitizeEmail(form.get("SubmitterEmail") as string);
    const issue_type = sanitizeText(form.get("IssueType") as string);
    const place_ref = sanitizeText(form.get("PlaceRef") as string);
    const description = sanitizeText(form.get("Description") as string);
    const images_count = Number(form.get("ImagesCount") ?? 0) || 0;

    // バリデーション例：Duplicate/Closed は説明必須
    if ((/^(Duplicate|Closed)$/i).test(issue_type) && !description) {
      return NextResponse.json({ error: "description is required for this issue type" }, { status: 400 });
    }

    const ref = makeRef("report");
    const payload = {
      ref,
      when: new Date().toISOString(),
      SubmitterName,
      SubmitterEmail,
      issue_type,
      place_ref,
      description,
      images_count,
    } as const;

    // user
    if (SubmitterEmail) {
      const mailUser = buildMail("user", "report", "receipt", payload);
      await sendMail({ to: SubmitterEmail, subject: mailUser.subject, text: mailUser.text });
    }

    // ops
    const mailOps = buildMail("ops", "report", "receipt", payload);
    await sendMail({ to: "cryptopaymap.app@gmail.com", subject: mailOps.subject, text: mailOps.text });

    // optional: local-only save（Vercel本番では無効想定）— SAVE_FILES=1 の時のみ
    if (process.env.SAVE_FILES === "1") {
      const { default: fs } = await import("fs");
      const { default: path } = await import("path");
      const dir = path.join(process.cwd(), "public/_submissions/report");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${ref}.json`), JSON.stringify(payload, null, 2));
    }

    const url = new URL(req.url);
    url.pathname = "/submitted.html";
    url.searchParams.set("kind", "report");
    url.searchParams.set("ref", ref);
    url.searchParams.set("name", SubmitterName || "Anonymous");
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to submit report" }, { status: 500 });
  }
}
