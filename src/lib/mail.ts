import nodemailer from "nodemailer";
import fs from "fs/promises";
import path from "path";

type MailInput = { to: string | string[]; subject: string; text: string; html?: string };
const MODE = process.env.MAIL_TRANSPORT ?? "console"; // smtp|file|console
const FROM = process.env.MAIL_FROM || "no-reply@example.com";
const OUT = process.env.MAIL_OUT_DIR || "public/_mail";

export async function sendMail({ to, subject, text, html }: MailInput) {
  if (MODE === "smtp") {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    } as any);
    await transport.sendMail({ from: FROM, to, subject, text, html });
    return;
  }
  const body = [`Subject: ${subject}`, `To: ${Array.isArray(to) ? to.join(",") : to}`, "", text].join("\n");
  if (MODE === "file") {
    await fs.mkdir(OUT, { recursive: true }).catch(()=>{});
    const fn = path.join(OUT, `${Date.now()}.${subject.replace(/\W+/g,"_")}.txt`);
    await fs.writeFile(fn, body, "utf8");
    return;
  }
  console.log("=== MAIL (console) ===\n" + body + "\n======================");
}
