import emailService from "../../services/email.service.js";
import {
  EMAIL_VERIFICATION_EXPIRY_MS,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  isEmailVerificationToken,
} from "../../utils/emailVerification.util.js";
import userModel from "../users/user.model.js";

function logDeliveryFailure(error) {
  const code =
    typeof error?.code === "string" && /^[a-z0-9_-]{1,40}$/i.test(error.code)
      ? error.code
      : "provider_error";
  console.error("Verification email delivery failed:", code);
}

async function clearToken(userId, tokenHash) {
  await userModel.updateOne(
    { _id: userId, emailVerificationTokenHash: tokenHash },
    {
      $unset: {
        emailVerificationTokenHash: 1,
        emailVerificationExpiresAt: 1,
      },
    },
  );
}

async function deliverToken(user, verification) {
  try {
    await emailService.sendVerificationEmail({
      email: user.email,
      token: verification.token,
    });
    return true;
  } catch (error) {
    logDeliveryFailure(error);
    await clearToken(user._id, verification.tokenHash);
    return false;
  }
}

export async function startEmailVerification(user) {
  const verification = generateEmailVerificationToken();
  const result = await userModel.updateOne(
    { _id: user._id, isEmailVerified: false },
    {
      $set: {
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationExpiresAt: verification.expiresAt,
      },
    },
  );
  if (result.matchedCount === 0) {
    throw new Error("Unable to create email verification token");
  }
  return deliverToken(user, verification);
}

export async function verifyEmailToken(token) {
  if (!isEmailVerificationToken(token)) return false;

  const user = await userModel.findOneAndUpdate(
    {
      emailVerificationTokenHash: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: { $gt: new Date() },
      isEmailVerified: false,
    },
    {
      $set: { isEmailVerified: true },
      $unset: {
        emailVerificationTokenHash: 1,
        emailVerificationExpiresAt: 1,
      },
    },
    { new: true },
  );

  return Boolean(user);
}

export async function resendEmailVerification(email) {
  const resendCutoff = new Date(
    Date.now() + EMAIL_VERIFICATION_EXPIRY_MS - 60 * 1000,
  );
  const verification = generateEmailVerificationToken();
  const user = await userModel.findOneAndUpdate(
    {
      email,
      isEmailVerified: false,
      $or: [
        { emailVerificationExpiresAt: { $exists: false } },
        { emailVerificationExpiresAt: { $lte: resendCutoff } },
      ],
    },
    {
      $set: {
        emailVerificationTokenHash: verification.tokenHash,
        emailVerificationExpiresAt: verification.expiresAt,
      },
    },
    { new: true },
  );

  if (user) await deliverToken(user, verification);
}
