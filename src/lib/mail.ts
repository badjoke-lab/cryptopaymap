// src/lib/mail.ts
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import { MailContent } from "./mailerTemplates";

/**
 * Send mail via selected transport (console / file / smtp)
 *
 * Environment variables:
 *   MAIL_TRANSPORT = console | file | smtp
 *   // SMTP/MAIL の両系統に対応（どちらでも可・SMTP_* 優先）
 *   SMTP_HOST / MAIL_HOST
 *   SMTP_PORT / MAIL_PORT
 *   SMTP_USER / MAIL_USER
 *   SMTP_PASS / MAIL_PASS
 *   SMTP_SECURE / MAIL_SECURE  (true/false)
 *   MAIL_FROM
 *   MAIL_OUT_DIR (file mode only)
 */
export async function sendMail({
  to,
  subject,
  text,
  quiet,
}: MailContent & { to: string; quiet?: boolean }): Promise<void> {
  const mode = process.env.MAIL_TRANSPORT ?? "console";
  const from = process.env.MAIL_FROM ?? "CryptoPayMap <no-reply@cryptopaymap.app>";

  if (mode === "console") {
    if (!quiet) {
      console.log("----- MAIL (console mode) -----");
      console.log("To:", to);
      console.log("From:", from);
      console.log("Subject:", subject);
      console.log("Body:\n" + text);
      console.log("-------------------------------");
    }
    return;
  }

  if (mode === "file") {
    const outDir = process.env.MAIL_OUT_DIR || "public/_mail";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(outDir, `mail-${ts}.txt`);
    fs.mkdirSync(outDir, { recursive: true });
    const content = [`To: ${to}`, `From: ${from}`, `Subject: ${subject}`, "", text].join("\n");
    fs.writeFileSync(filePath, content, "utf-8");
    if (!quiet) console.log(`📩 Mail saved to ${filePath}`);
    return;
  }

  if (mode === "smtp") {
    // ---- 優先順：SMTP_* → MAIL_* ----
    const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
    const portStr = process.env.SMTP_PORT || process.env.MAIL_PORT;
    const user = process.env.SMTP_USER || process.env.MAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
    const secureStr = process.env.SMTP_SECURE ?? process.env.MAIL_SECURE;

    const port = Number(portStr ?? 465);
    const secure = typeof secureStr === "string"
      ? secureStr === "true"
      : port === 465; // 465=SMTPS、587=STARTTLS

    if (!host || !user || !pass) {
      throw new Error("Missing SMTP credentials. Set SMTP_* (or MAIL_*) variables.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,           // 587 なら false（STARTTLS を自動利用）
      auth: { user, pass },
    });

    await transporter.sendMail({ from, to, subject, text });

    if (!quiet) console.log(`✅ SMTP mail sent to ${to}`);
    return;
  }

  throw new Error(`Unknown MAIL_TRANSPORT mode: ${mode}`);
}
