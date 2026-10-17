import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import config from "../config/config.js";
import sessionModel from "../modules/auth/session.model.js";
import userModel from "../modules/users/user.model.js";

async function authenticate(req, res, next) {
  const authorization = req.get("authorization");
  const [scheme, token, ...extra] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token || extra.length > 0) {
    return res.status(401).json({ message: "Bearer token is required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Access token has expired" });
    }
    if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      return res.status(401).json({ message: "Access token is invalid" });
    }
    return next(error);
  }

  if (
    payload.tokenType !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.sessionId !== "string" ||
    !mongoose.isValidObjectId(payload.sub) ||
    !mongoose.isValidObjectId(payload.sessionId)
  ) {
    return res.status(401).json({ message: "Access token is invalid" });
  }

  try {
    const session = await sessionModel.findById(payload.sessionId);
    if (
      !session ||
      session.revoked ||
      session.user.toString() !== payload.sub ||
      session.expiresAt <= new Date()
    ) {
      return res.status(401).json({ message: "Session is invalid or expired" });
    }

    const user = await userModel.findById(payload.sub);

    if (
      !user ||
      user.isActive === false ||
      (user.status !== undefined && user.status !== "ACTIVE")
    ) {
      return res.status(401).json({ message: "User account is unavailable" });
    }

    req.user = user;
    req.authSession = session;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Attaches `req.user` and `req.authSession` when a valid access token is sent,
 * but never rejects the request. Use on public routes whose response can differ
 * for logged-in users (for example, admins also see INACTIVE categories).
 *
 * Any problem with the token (missing, expired, malformed, revoked session,
 * inactive user) is treated as "guest" and the request continues without a user.
 */
export async function optionalAuthenticate(req, res, next) {
  const authorization = req.get("authorization");

  // Guest: no Authorization header at all
  if (!authorization) return next();

  const [scheme, token, ...extra] = authorization.split(" ");
  if (scheme !== "Bearer" || !token || extra.length > 0) return next();

  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (
      payload.tokenType !== "access" ||
      typeof payload.sub !== "string" ||
      typeof payload.sessionId !== "string" ||
      !mongoose.isValidObjectId(payload.sub) ||
      !mongoose.isValidObjectId(payload.sessionId)
    ) {
      return next();
    }

    const session = await sessionModel.findById(payload.sessionId);

    if (
      !session ||
      session.revoked ||
      session.user.toString() !== payload.sub ||
      session.expiresAt <= new Date()
    ) {
      return next();
    }

    const user = await userModel.findById(payload.sub);
    if (
      !user ||
      user.isActive === false ||
      (user.status !== undefined && user.status !== "ACTIVE")
    ) {
      return next();
    }

    req.user = user;
    req.authSession = session;

    return next();
  } catch (error) {
    // Expired, malformed, or not-yet-valid token: continue as a guest.
    // (TokenExpiredError and NotBeforeError both extend JsonWebTokenError.)
    if (error instanceof jwt.JsonWebTokenError) return next();

    // Anything else (for example a database failure) is a real error
    return next(error);
  }
}
export default authenticate;
