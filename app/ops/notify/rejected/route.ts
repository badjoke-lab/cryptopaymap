// app/ops/notify/rejected/route.ts
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
    // expected: { kind: 'owner' | 'community', ref, reviewed_on, Business, reason, needed_fields, submitterEmail }
    const kind = body.kind as "owner" | "community";
    if (!kind) return NextResponse.json({ error: "kind required" }, { status: 400 });

    const mail = buildMail("user", kind, "rejected", {
      ref: sanitizeText(body.ref),
      reviewed_on: sanitizeText(body.reviewed_on),
      Business: sanitizeText(body.Business),
      reason: sanitizeText(body.reason),
      needed_fields: sanitizeText(body.needed_fields),
      Country: sanitizeText(body.Country),
      City: sanitizeText(body.City),
      Category: sanitizeText(body.Category),
    });
    const to = sanitizeEmail(body.submitterEmail);
    if (!to) return NextResponse.json({ error: "submitterEmail required" }, { status: 400 });

    await sendMail({ to, subject: mail.subject, text: mail.text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to send rejected" }, { status: 500 });
  }
}
