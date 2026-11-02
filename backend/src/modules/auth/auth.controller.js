import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import config from "../../config/config.js";
import {
  hashPassword,
  verifyPasswordAndUpgrade,
} from "../../common/utils/password.util.js";
import {
  resendEmailVerification,
  startEmailVerification,
  verifyEmailToken,
} from "./email-verification.service.js";
import { isEmailVerificationToken } from "../../utils/emailVerification.util.js";
import sessionModel from "./session.model.js";
import userModel from "../users/user.model.js";
import emailService from "../../services/email.service.js";

const ACCESS_TOKEN_LIFETIME = "15m";
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const REMEMBER_ME_SESSION_MAX_AGE =
  config.REMEMBER_ME_SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Generates a SHA-256 hash of a token for secure storage and comparison.
 *
 * @param {string} token - The token to hash.
 * @returns {string} The hexadecimal representation of the token's hash.
 */
function hashToken(token) {
  // Hash the token using SHA-256 and return the result as a hexadecimal string.
  return createHash("sha256").update(token).digest("hex");
}
/**
 * Converts a user database document into a safe, public-facing object.
 *
 * Exposes only the user fields permitted in API responses, preventing
 * sensitive internal account data from being returned to the client.
 *
 * @param {Object} user - The user document retrieved from the database.
 * @returns {Object} A sanitized object containing public user information.
 */
function publicUser(user) {
  // Return only the fields that are allowed to be exposed to the client.
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Sets the refresh-token cookie in the client's browser.
 *
 * Configures the cookie with security attributes and a restricted path.
 * Remembered sessions also receive a persistent lifetime bounded by expiry.
 *
 * @param {Object} res - The response object used to set the cookie.
 * @param {string} token - The signed refresh token to store in the cookie.
 * @param {Object} session - The session that determines cookie persistence.
 * @returns {void}
 */
function setRefreshCookie(res, token, session) {
  // Store the refresh token in a cookie with the configured security options.
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    ...(session.rememberMe
      ? { maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()) }
      : {}),
  });
}
/**
 * Clears the refresh-token cookie from the client's browser.
 *
 * Uses the same cookie options as the original cookie to ensure
 * the browser correctly removes the stored refresh token.
 *
 * @param {Object} res - The response object used to clear the cookie.
 * @returns {void}
 */
function clearRefreshCookie(res) {
  // Remove the refresh-token cookie using its configured attributes.
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

/**
 * Creates an authenticated session for a user and issues JWT tokens.
 *
 * Generates a refresh token, stores its hash with session metadata,
 * creates an access token linked to the session, and sets the refresh
 * token in a secure cookie.
 *
 * @param {Object} user - The authenticated user for whom the session is created.
 * @param {Object} req - The request object containing client metadata.
 * @param {Object} res - The response object used to set the refresh cookie.
 * @returns {Promise<string>} A signed JWT access token.
 */
async function issueSession(user, req, res, rememberMe = false) {
  const sessionMaxAge = rememberMe
    ? REMEMBER_ME_SESSION_MAX_AGE
    : REFRESH_TOKEN_MAX_AGE;
  const expiresAt = new Date(Date.now() + sessionMaxAge);

  // Bound the refresh token's lifetime to this session's fixed expiration.
  const refreshToken = jwt.sign(
    {
      sub: user._id.toString(),
      tokenType: "refresh",
      jti: randomUUID(),
      exp: Math.floor(expiresAt.getTime() / 1000),
    },
    config.JWT_SECRET,
    { algorithm: "HS256" },
  );

  // Store session metadata and the hashed refresh token for secure verification.
  const session = await sessionModel.create({
    user: user._id,
    rememberMe,
    refreshTokenHash: hashToken(refreshToken),
    ip: req.ip,
    userAgent: req.get("user-agent") ?? "unknown",
    expiresAt,
  });

  // Issue an access token associated with the newly created session.
  const accessToken = jwt.sign(
    {
      sub: user._id.toString(),
      sessionId: session._id.toString(),
      tokenType: "access",
    },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_LIFETIME, algorithm: "HS256" },
  );

  // Send the refresh token through the configured HTTP cookie.
  setRefreshCookie(res, refreshToken, session);
  return accessToken;
}

/**
 * Returns a user-friendly message for MongoDB duplicate-key errors.
 *
 * @param {Error} error - The database error to inspect.
 * @returns {string | null} A duplicate-account message, or null if the error
 * is not a duplicate-key error.
 */
function getDuplicateAccountMessage(error) {
  // Ignore errors that are not caused by a duplicate key.
  if (error.code !== 11000) {
    return null;
  }

  // Identify the duplicated field and return an appropriate message.
  return error.keyPattern?.email
    ? "Email is already registered"
    : "Username is already taken";
}

/**
 * Creates a registration handler for the specified user role.
 *
 * Validates registration data, checks for existing accounts, creates
 * the user with a securely hashed password, and establishes an
 * authenticated session after successful registration.
 *
 * @param {string} role - The role assigned to the newly registered user.
 * @returns {Function} An asynchronous Express request handler.
 */

export function createRegistrationHandler(role) {
  return async (req, res, next) => {
    try {
      // Normalize user-provided registration data.
      const firstName = req.body.firstName.trim();
      const lastName = req.body.lastName.trim();
      const username = req.body.username.trim().toLowerCase();
      const email = req.body.email.trim().toLowerCase();
      const password = req.body.password;

      // Reject registration if the username or email is already in use.
      const existingUser = await userModel.findOne({
        $or: [{ username }, { email }],
      });

      if (existingUser) {
        const duplicateField =
          existingUser.email === email ? "Email" : "Username";
        return res.status(409).json({
          message: `${duplicateField} is already registered`,
        });
      }

      // Create the account with a hashed password and the assigned role.
      const user = await userModel.create({
        firstName,
        lastName,
        username,
        email,
        password: await hashPassword(password),
        role,
        status: "ACTIVE",
        isActive: true,
        isEmailVerified: false,
      });

      const verificationEmailSent = await startEmailVerification(user);

      // Establish an authenticated session and issue an access token.
      const accessToken = await issueSession(user, req, res);

      // Return the created user's public information and access token.
      return res.status(201).json({
        message: verificationEmailSent
          ? "User registered successfully"
          : "Account created, but the verification email could not be sent. Please request another email.",
        user: publicUser(user),
        accessToken,
        verificationEmailSent,
      });
    } catch (error) {
      // Handle duplicate-key conflicts that occur during account creation.
      const duplicateMessage = getDuplicateAccountMessage(error);
      if (duplicateMessage) {
        return res.status(409).json({ message: duplicateMessage });
      }
      // Forward unexpected errors to the centralized error handler.
      return next(error);
    }
  };
}

/**
 * Authenticates a user and establishes a new session.
 *
 * Accepts an email address or username as the login identifier,
 * verifies the user's password, checks account status, and issues
 * authentication tokens when the credentials are valid.
 *
 * @param {Object} req - The request object containing login credentials.
 * @param {Object} res - The response object used to return the result.
 * @param {Function} next - The middleware function for forwarding errors.
 * @returns {Promise<Object|void>} The HTTP response or forwarded error.
 */
export async function login(req, res, next) {
  try {
    // Normalize the login identifier supplied by the client.
    const identifier = (
      req.body.identifier ??
      req.body.email ??
      req.body.username
    )
      .trim()
      .toLowerCase();

    // Determine whether to search for the account by email or username.
    const isEmail = identifier.includes("@");

    // Retrieve the account and explicitly include its password hash.
    const user = await userModel
      .findOne(isEmail ? { email: identifier } : { username: identifier })
      .select("+password");

    // Reject invalid credentials without revealing which value is incorrect.
    if (!user || !(await verifyPasswordAndUpgrade(user, req.body.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Prevent inactive or suspended accounts from establishing a session.
    if (
      user.isActive === false ||
      (user.status !== undefined && user.status !== "ACTIVE")
    ) {
      return res.status(403).json({
        message:
          user.status === "SUSPENDED"
            ? "This account is suspended"
            : "This account is inactive",
      });
    }

    // Create an authenticated session and issue an access token.
    const accessToken = await issueSession(
      user,
      req,
      res,
      req.body.rememberMe === true,
    );

    // Return the sanitized user profile and access token.
    return res.status(200).json({
      message: "Login successful",
      user: publicUser(user),
      accessToken,
    });
  } catch (error) {
    // Forward unexpected errors to the centralized error handler.
    return next(error);
  }
}

export async function verifyEmail(req, res, next) {
  res.set("Cache-Control", "no-store");
  res.set("Referrer-Policy", "no-referrer");

  const token = req.body?.token ?? req.query.token;
  if (!isEmailVerificationToken(token)) {
    return res
      .status(400)
      .json({ message: "Verification link is invalid or expired" });
  }

  try {
    const verified = await verifyEmailToken(token);
    if (!verified) {
      return res
        .status(400)
        .json({ message: "Verification link is invalid or expired" });
    }

    return res.status(200).json({
      message: "Email verified successfully. You can now sign in.",
    });
  } catch (error) {
    return next(error);
  }
}

export async function resendVerification(req, res, next) {
  const email = req.body.email.trim().toLowerCase();

  try {
    await resendEmailVerification(email);

    return res.status(202).json({
      message:
        "If an unverified account exists for that address, a verification email will be sent shortly.",
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Reactivates an inactive user account after verifying the user's credentials.
 *
 * Identifies the account by email or username, validates the password,
 * rejects suspended or already-active accounts, and restores the account
 * to an active state.
 *
 * @param {Object} req - The request object containing account credentials.
 * @param {Object} res - The response object used to return the result.
 * @param {Function} next - The middleware function for forwarding errors.
 * @returns {Promise<Object|void>} The HTTP response or forwarded error.
 */

export async function reactivateAccount(req, res, next) {
  try {
    // Normalize the account identifier supplied by the client.
    const identifier = (
      req.body.identifier ??
      req.body.email ??
      req.body.username
    )
      .trim()
      .toLowerCase();

    // Retrieve the account by email or username, including its password hash.
    const user = await userModel
      .findOne(
        identifier.includes("@")
          ? { email: identifier }
          : { username: identifier },
      )
      .select("+password");

    // Reject requests with invalid account credentials
    if (!user || !(await verifyPasswordAndUpgrade(user, req.body.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Prevent suspended accounts from being reactivated through this endpoint
    if (user.status === "SUSPENDED") {
      return res.status(403).json({ message: "This account is suspended" });
    }

    // Reject requests when the account is already active
    if (user.status !== "INACTIVE" && user.isActive !== false) {
      return res
        .status(409)
        .json({ message: "This account is already active" });
    }

    // Restore the account's active status in the database.
    await userModel.findByIdAndUpdate(
      user._id,
      { $set: { status: "ACTIVE", isActive: true } },
      { new: true, runValidators: true },
    );

    // Confirm reactivation and prompt the user to sign in again.
    return res.json({
      message: "Account reactivated. Sign in to continue.",
    });
  } catch (error) {
    // Forward unexpected errors to the centralized error handler.
    return next(error);
  }
}

/**
 * Retrieves the authenticated user's profile.
 * Returns the current user's public profile information using the
 * authenticated user attached to the request by authentication middleware.
 *
 * @param {Object} req - The request object containing the authenticated user.
 * @param {Object} res - The response object used to return the profile.
 * @returns {Object} A JSON response containing the user's public profile.
 */
export function getMe(req, res) {
  // Return the authenticated user's sanitized profile information.
  return res.json({
    message: "User retrieved successfully",
    user: publicUser(req.user),
  });
}

/**
 * Validates and rotates a refresh token to maintain an authenticated session.
 *
 * Verifies the refresh token, validates its associated session and user
 * account, replaces the stored refresh-token hash, and issues a new access
 * token. Invalid or expired tokens are rejected and the refresh cookie
 * is cleared when appropriate.
 *
 * @param {Object} req - The request object containing the refresh-token cookie.
 * @param {Object} res - The response object used to return tokens and clear cookies.
 * @param {Function} next - The middleware function for forwarding unexpected errors.
 * @returns {Promise<Object|void>} The HTTP response or forwarded error.
 */
export async function refreshToken(req, res, next) {
  // Retrieve the refresh token from the request cookies.
  const token = req.cookies?.refreshToken;

  if (!token) {
    return res.status(401).json({ message: "Refresh token is missing" });
  }

  try {
    // Verify the token's signature and restrict verification to HS256.
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    // Validate the token type and ensure the subject is a valid user ID.
    if (
      payload.tokenType !== "refresh" ||
      typeof payload.sub !== "string" ||
      !mongoose.isValidObjectId(payload.sub)
    ) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Find the active session matching the refresh-token hash and expiration.
    const session = await sessionModel.findOne({
      user: payload.sub,
      refreshTokenHash: hashToken(token),
      revoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Retrieve the account and verify that it remains eligible for authentication.
    const user = await userModel.findById(payload.sub);
    if (
      !user ||
      user.isActive === false ||
      (user.status !== undefined && user.status !== "ACTIVE")
    ) {
      // Revoke the session if its associated account is no longer active.
      session.revoked = true;
      await session.save();

      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Keep the replacement token within the session's original expiration.
    const newRefreshToken = jwt.sign(
      {
        sub: user._id.toString(),
        tokenType: "refresh",
        jti: randomUUID(),
        exp: Math.floor(session.expiresAt.getTime() / 1000),
      },
      config.JWT_SECRET,
      { algorithm: "HS256" },
    );

    // Replace only the token hash; refreshing must not extend the session.
    session.refreshTokenHash = hashToken(newRefreshToken);
    await session.save();

    // Issue a new access token linked to the existing session.
    const accessToken = jwt.sign(
      {
        sub: user._id.toString(),
        sessionId: session._id.toString(),
        tokenType: "access",
      },
      config.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_LIFETIME, algorithm: "HS256" },
    );

    // Update the browser's refresh-token cookie.
    setRefreshCookie(res, newRefreshToken, session);

    // Return the new access token to the client.
    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken,
    });
  } catch (error) {
    // Handle invalid or expired JWTs without exposing verification details.
    if (
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      // Revoke the session associated with the rejected refresh token, if found.
      const revokedSession = await sessionModel.findOneAndUpdate(
        { refreshTokenHash: hashToken(token), revoked: false },
        { $set: { revoked: true } },
      );
      if (!revokedSession && req.authSession) {
        req.authSession.revoked = true;
        await req.authSession.save();
      }

      clearRefreshCookie(res);

      return res.status(401).json({
        message:
          error instanceof jwt.TokenExpiredError
            ? "Refresh token has expired"
            : "Refresh token is invalid",
      });
    }

    // Forward unexpected database or application errors to the error handler.
    return next(error);
  }
}

/**
 * Logs out the user by revoking the associated authentication session.
 *
 * Revokes the session identified by the refresh token or, if no refresh
 * token is present, revokes the authenticated session attached to the
 * request. Finally, clears the refresh-token cookie.
 *
 * @param {Object} req - The request object containing the refresh token or authenticated session.
 * @param {Object} res - The response object used to clear the refresh cookie and return the result.
 * @param {Function} next - The middleware function for forwarding unexpected errors.
 * @returns {Promise<Object|void>} The HTTP response or forwarded error.
 */
export async function logout(req, res, next) {
  try {
    // Retrieve the refresh token from the client's cookies.
    const token = req.cookies?.refreshToken;

    if (token) {
      // Revoke the active session associated with the refresh-token hash.
      const revokedSession = await sessionModel.findOneAndUpdate(
        { refreshTokenHash: hashToken(token), revoked: false },
        { $set: { revoked: true } },
      );
      if (!revokedSession && req.authSession) {
        req.authSession.revoked = true;
        await req.authSession.save();
      }
    } else if (req.authSession) {
      // Revoke the authenticated session when no refresh token is available.
      req.authSession.revoked = true;
      await req.authSession.save();
    }

    // Remove the refresh-token cookie from the client's browser.
    clearRefreshCookie(res);

    // Confirm logout without exposing internal session details.
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    // Forward unexpected errors to the centralized error handler.
    return next(error);
  }
}

/**
 * Retrieves a list of users with selected public account fields.
 *
 * Fetches up to 100 user records, excludes unselected database fields,
 * and returns plain JavaScript objects for efficient response serialization.
 *
 * @param {Object} _req - The request object, unused by this handler.
 * @param {Object} res - The response object used to return the user list.
 * @param {Function} next - The middleware function for forwarding errors.
 * @returns {Promise<Object|void>} A JSON response containing the users or a forwarded error.
 */
export async function listUsers(_req, res, next) {
  try {
    // Retrieve selected user fields, limiting the result to 100 records.
    const users = await userModel
      .find()
      .select(
        "firstName lastName username email role isActive createdAt updatedAt",
      )
      .limit(100)
      .lean();

    // Return the retrieved users in the API response.
    return res.json({ users });
  } catch (error) {
    // Forward unexpected errors to the centralized error handler.
    return next(error);
  }
}

export const forgotPassword = async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // Always use the same public response to avoid revealing
    // whether an email address has an account.
    const genericResponse = {
      success: true,
      message: "If an account exists, a password reset link has been sent.",
    };

    const user = await userModel.findOne({ email }).select(
      "+passwordResetTokenHash +passwordResetExpiresAt",
    );

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Generate a cryptographically secure, random token.
    const resetToken = randomBytes(32).toString("hex");

    // Store only the SHA-256 hash in the database.
    user.passwordResetTokenHash = createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Token expires after 20 minutes.
    user.passwordResetExpiresAt = new Date(Date.now() + 20 * 60 * 1000);

    await user.save();

    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        token: resetToken,
      });
    } catch (emailError) {
      // Do not leave a valid reset token when email delivery fails.
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      await user.save();

      throw emailError;
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
};
