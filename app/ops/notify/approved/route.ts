// app/ops/notify/approved/route.ts
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
    // expected: { kind: 'owner' | 'community', ref, approved_on, Business, Country, City, Category, public_url, submitterEmail }
    const kind = body.kind as "owner" | "community";
    if (!kind) return NextResponse.json({ error: "kind required" }, { status: 400 });

    const mail = buildMail("user", kind, "approved", {
      ref: sanitizeText(body.ref),
      approved_on: sanitizeText(body.approved_on),
      Business: sanitizeText(body.Business),
      Country: sanitizeText(body.Country),
      City: sanitizeText(body.City),
      Category: sanitizeText(body.Category),
      public_url: sanitizeText(body.public_url),
    });
    const to = sanitizeEmail(body.submitterEmail);
    if (!to) return NextResponse.json({ error: "submitterEmail required" }, { status: 400 });

    await sendMail({ to, subject: mail.subject, text: mail.text });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "failed to send approved" }, { status: 500 });
  }
}
