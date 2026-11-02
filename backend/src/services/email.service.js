import nodemailer from "nodemailer";
import { getEmailConfig } from "../config/email.config.js";
import verifyEmailTemplate from "../templates/emails/verify-email.template.js";
import { EMAIL_VERIFICATION_EXPIRY_MINUTES } from "../utils/emailVerification.util.js";

function createTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
}

async function sendVerificationEmail({ email, token }) {
  const config = getEmailConfig();
  const transporter = createTransporter(config);
  const verificationUrl = new URL(
    "/verify-email",
    `${config.frontendUrl}/`,
  );
  verificationUrl.searchParams.set("token", token);
  const template = verifyEmailTemplate(
    verificationUrl.toString(),
    EMAIL_VERIFICATION_EXPIRY_MINUTES,
  );

  return transporter.sendMail({
    from: config.from,
    to: email,
    ...template,
  });
}

async function sendPasswordResetEmail({ email, token }) {
  const config = getEmailConfig();
  const transporter = createTransporter(config);
  const resetUrl = new URL("/reset-password", `${config.frontendUrl}/`);
  resetUrl.searchParams.set("token", token);

  return transporter.sendMail({
    from: config.from,
    to: email,
    subject: "Reset your PadhaHai password",
    html: `
      <h2>Password reset request</h2>
      <p>We received a request to reset your PadhaHai password.</p>
      <p>
        <a href="${resetUrl.toString()}">
          Reset your password
        </a>
      </p>
      <p>This link expires in 20 minutes and can only be used once.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

export default { sendVerificationEmail, sendPasswordResetEmail };