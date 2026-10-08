import {
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import config from "../config/config.js";
import sessionModel from "../modules/auth/session.model.js";
import userModel from "../modules/auth/user.model.js";

const ACCESS_TOKEN_LIFETIME = "15m";
const REFRESH_TOKEN_LIFETIME = "7d";
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function verifyPasswordAndUpgrade(user, password) {
  if (await bcrypt.compare(password, user.password)) {
    return true;
  }

  if (!/^[\da-f]{64}$/i.test(user.password)) {
    return false;
  }

  const storedHash = Buffer.from(user.password, "hex");
  const suppliedHash = createHash("sha256").update(password).digest();
  if (!timingSafeEqual(storedHash, suppliedHash)) {
    return false;
  }

  user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await user.save();
  return true;
}

function publicUser(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function setRefreshCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
  });
}

async function issueSession(user, req, res) {
  const refreshToken = jwt.sign(
    {
      sub: user._id.toString(),
      tokenType: "refresh",
      jti: randomUUID(),
    },
    config.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_LIFETIME, algorithm: "HS256" },
  );
  const session = await sessionModel.create({
    user: user._id,
    refreshTokenHash: hashToken(refreshToken),
    ip: req.ip,
    userAgent: req.get("user-agent") ?? "unknown",
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE),
  });
  const accessToken = jwt.sign(
    {
      sub: user._id.toString(),
      sessionId: session._id.toString(),
      tokenType: "access",
    },
    config.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_LIFETIME, algorithm: "HS256" },
  );

  setRefreshCookie(res, refreshToken);
  return accessToken;
}

function getDuplicateAccountMessage(error) {
  if (error.code !== 11000) {
    return null;
  }

  return error.keyPattern?.email
    ? "Email is already registered"
    : "Username is already taken";
}

export function createRegistrationHandler(role) {
  return async (req, res, next) => {
    try {
      const firstName = req.body.firstName.trim();
      const lastName = req.body.lastName.trim();
      const username = req.body.username.trim().toLowerCase();
      const email = req.body.email.trim().toLowerCase();
      const password = req.body.password;

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

      const user = await userModel.create({
        firstName,
        lastName,
        username,
        email,
        password: await bcrypt.hash(password, BCRYPT_ROUNDS),
        role,
        isActive: true,
      });
      const accessToken = await issueSession(user, req, res);

      return res.status(201).json({
        message: "User registered successfully",
        user: publicUser(user),
        accessToken,
      });
    } catch (error) {
      const duplicateMessage = getDuplicateAccountMessage(error);
      if (duplicateMessage) {
        return res.status(409).json({ message: duplicateMessage });
      }
      return next(error);
    }
  };
}

export async function login(req, res, next) {
  try {
    const identifier = (
      req.body.identifier ??
      req.body.email ??
      req.body.username
    )
      .trim()
      .toLowerCase();
    const isEmail = identifier.includes("@");
    const user = await userModel
      .findOne(isEmail ? { email: identifier } : { username: identifier })
      .select("+password");

    if (
      !user ||
      !(await verifyPasswordAndUpgrade(user, req.body.password))
    ) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account is inactive" });
    }

    const accessToken = await issueSession(user, req, res);
    return res.status(200).json({
      message: "Login successful",
      user: publicUser(user),
      accessToken,
    });
  } catch (error) {
    return next(error);
  }
}

export function getMe(req, res) {
  return res.json({
    message: "User retrieved successfully",
    user: publicUser(req.user),
  });
}

export async function refreshToken(req, res, next) {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ message: "Refresh token is missing" });
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (
      payload.tokenType !== "refresh" ||
      typeof payload.sub !== "string" ||
      !mongoose.isValidObjectId(payload.sub)
    ) {
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

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

    const user = await userModel.findById(payload.sub);
    if (!user || !user.isActive) {
      session.revoked = true;
      await session.save();
      clearRefreshCookie(res);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const newRefreshToken = jwt.sign(
      {
        sub: user._id.toString(),
        tokenType: "refresh",
        jti: randomUUID(),
      },
      config.JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_LIFETIME, algorithm: "HS256" },
    );
    session.refreshTokenHash = hashToken(newRefreshToken);
    session.expiresAt = new Date(Date.now() + REFRESH_TOKEN_MAX_AGE);
    await session.save();

    const accessToken = jwt.sign(
      {
        sub: user._id.toString(),
        sessionId: session._id.toString(),
        tokenType: "access",
      },
      config.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_LIFETIME, algorithm: "HS256" },
    );
    setRefreshCookie(res, newRefreshToken);
    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken,
    });
  } catch (error) {
    if (
      error instanceof jwt.TokenExpiredError ||
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.NotBeforeError
    ) {
      await sessionModel.findOneAndUpdate(
        { refreshTokenHash: hashToken(token), revoked: false },
        { $set: { revoked: true } },
      );
      clearRefreshCookie(res);
      return res.status(401).json({
        message:
          error instanceof jwt.TokenExpiredError
            ? "Refresh token has expired"
            : "Refresh token is invalid",
      });
    }
    return next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await sessionModel.findOneAndUpdate(
        { refreshTokenHash: hashToken(token), revoked: false },
        { $set: { revoked: true } },
      );
    } else if (req.authSession) {
      req.authSession.revoked = true;
      await req.authSession.save();
    }

    clearRefreshCookie(res);
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    return next(error);
  }
}

export async function listUsers(_req, res, next) {
  try {
    const users = await userModel
      .find()
      .select("firstName lastName username email role isActive createdAt updatedAt")
      .limit(100)
      .lean();
    return res.json({ users });
  } catch (error) {
    return next(error);
  }
}
