import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;
const LEGACY_SHA256_PATTERN = /^[\da-f]{64}$/i;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, storedHash) {
  if (await bcrypt.compare(password, storedHash)) return true;
  if (!LEGACY_SHA256_PATTERN.test(storedHash)) return false;

  const hashBytes = Buffer.from(storedHash, "hex");
  const suppliedHashBytes = createHash("sha256").update(password).digest();
  return timingSafeEqual(hashBytes, suppliedHashBytes);
}

export async function verifyPasswordAndUpgrade(user, password) {
  if (!(await verifyPassword(password, user.password))) return false;
  if (!LEGACY_SHA256_PATTERN.test(user.password)) return true;

  user.password = await hashPassword(password);
  await user.save();
  return true;
}
