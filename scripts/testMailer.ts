// scripts/testMailer.ts
import "dotenv/config";

function die(e: unknown): never {
  // 失敗を必ず可視化
  console.error("❌ Fatal:", e);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
}

(async () => {
  console.log("=== testMailer: start ===");
  console.log("CWD:", process.cwd());
  console.log("MAIL_TRANSPORT:", process.env.MAIL_TRANSPORT ?? "(unset, default console)");
  console.log("NODE_VERSION:", process.version);

  let buildMail: any;
  let sendMail: any;
  try {
    ({ buildMail } = await import("../src/lib/mailerTemplates"));
    ({ sendMail } = await import("../src/lib/mail"));
  } catch (e) {
    die(e);
  }

  const to = process.env.TEST_MAIL_TO ?? "test@example.com";
  const payload = {
    ref: "owner-20251021-0001",
    when: new Date().toISOString(),
    Business: "South Pole Coffee",
    Country: "Antarctica",
    City: "McMurdo Station",
    Category: "Cafe",
    AcceptedRaw: "BTC, USDT",
    ImagesCount: 2,
    SubmitterName: "Alice",
    SubmitterEmail: "alice@example.com",
    // owner_verify_url: "https://example.com/verify/owner-20251021-0001",
  } as const;

  console.log("=== building mail (user/owner/receipt) ===");
  const mail = buildMail("user", "owner", "receipt", payload);

  console.log("--- SUBJECT ---");
  console.log(mail.subject);
  console.log("--- BODY ---");
  console.log(mail.text);

  console.log("=== sending via sendMail() ===");
  try {
    await sendMail({
      to,
      subject: mail.subject,
      text: mail.text,
    });
    console.log("✅ sendMail() completed");
  } catch (e) {
    die(e);
  }

  console.log("=== testMailer: done ===");
})();
