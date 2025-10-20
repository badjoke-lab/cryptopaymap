// scripts/mail_ping.ts
import { sendMail } from "../src/lib/mail";

async function main() {
  const to = process.env.MAIL_TO || "me@example.com";
  await sendMail({
    to,
    subject: "ping",
    text: "ok",
  });
  // eslint-disable-next-line no-console
  console.log("[mail] sent to:", to, `(mode=${(process.env.MAIL_TRANSPORT||"console").toLowerCase()})`);
}

main().catch((e) => {
  console.error("[mail] failed:", e);
  process.exit(1);
});
