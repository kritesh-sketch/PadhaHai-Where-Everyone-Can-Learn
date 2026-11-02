import { createHash, randomBytes } from "node:crypto";

export const EMAIL_VERIFICATION_EXPIRY_MINUTES = 30;
export const EMAIL_VERIFICATION_EXPIRY_MS =
  EMAIL_VERIFICATION_EXPIRY_MINUTES * 60 * 1000;

export function generateEmailVerificationToken() {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS),
  };
}

export function hashEmailVerificationToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function isEmailVerificationToken(token) {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}
