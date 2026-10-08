import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import config from "../../config/config.js";
import sessionModel from "../auth/session.model.js";
import userModel from "../auth/user.model.js";

async function authenticate(req, res, next) {
  const authorization = req.get("authorization");
  const [scheme, token, ...extra] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token || extra.length > 0) {
    return res.status(401).json({ message: "Bearer access token is required" });
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
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "User account is unavailable" });
    }

    req.user = user;
    req.authSession = session;
    return next();
  } catch (error) {
    return next(error);
  }
}

export default authenticate;
