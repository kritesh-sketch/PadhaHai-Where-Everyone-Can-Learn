import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST,
  port: Number(process.env.EMAIL_SMTP_PORT || 587),
  secure: process.env.EMAIL_SMTP_SECURE === "true",
  auth: {
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASSWORD,
  },
});

async function main() {
  if (
    !process.env.EMAIL_SMTP_USER ||
    !process.env.EMAIL_SMTP_PASSWORD ||
    !process.env.EMAIL_FROM ||
    !process.env.TEST_EMAIL
  ) {
    throw new Error("Missing SMTP configuration. Check your .env file.");
  }

  await transporter.verify();
  console.log("Brevo SMTP connection successful!");

  const result = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.TEST_EMAIL,
    subject: "PadhaHai email verification test",
    text: "Success! Your PadhaHai backend can send emails through Brevo.",
  });

  console.log("Email accepted by Brevo:", result.messageId);
}

main().catch((error) => {
  console.error("Email test failed:", error.message);
  process.exitCode = 1;
});
