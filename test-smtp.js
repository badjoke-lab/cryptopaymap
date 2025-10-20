// test-smtp.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

async function run(){
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_PORT || 587),
    secure: (process.env.MAIL_SECURE === "true"), // false -> STARTTLS
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to: "cryptopaymap.app@gmail.com", // ここに確認用の受信先を入れる
    subject: "[TEST] CryptoPayMap SMTP test",
    text: "これが SMTP テストメールです。"
  });

  console.log("sent:", info);
}

run().catch(e=>{
  console.error("failed:", e);
  process.exit(1);
});
