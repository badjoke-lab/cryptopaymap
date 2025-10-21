// app/ops/notify/report-resolution/route.ts
import { NextResponse } from "next/server";
import { buildMail } from "@/lib/mailerTemplates";
import { sendMail } from "@/lib/mail";
import { sanitizeText, sanitizeEmail } from "@/lib/sanitize";

export async function POST(req: Request) {
  try {
    const AUTH = process.env.OPS_NOTIFY_KEY;
    const key = req.headers.get("x-ops-key");
    if (!AUTH || key !== AUTH) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    // expected: { ref, SubmitterName, submitterEmail, resolutionEN, handled_on, resolution_detail, public_url }
    const mail = buildMail("user", "report", "report_resolution", {
      ref: sanitizeText(body.ref),
      SubmitterName: sanitizeText(body.SubmitterName),
      resolutionEN: sanitizeText(body.resolutionEN) as any,
      handled_on: sanitizeText(body.handled_on),
      resolution_detail: sanitizeText(body.resolution_detail),
      public_url: sanitizeText(body.public_url),
    });
    const to = sanitizeEmail(body.submitterEmail);
    if (!to) return NextResponse.json({ error: "submitterEmail required" }, { status: 400 });

    await sendMail({ to, subject: mail.subject, text: mail.text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to send report resolution" }, { status: 500 });
  }
}
