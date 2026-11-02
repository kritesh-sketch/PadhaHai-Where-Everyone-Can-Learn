import { Router } from "express";
import * as authController from "../modules/auth/auth.controller.js";
import authenticate, {
  optionalAuthenticate,
} from "../middleware/auth.middleware.js";
import {
  validateEmailRequest,
  validateLogin,
  validateRegistration,
  validateVerificationToken,
} from "../modules/auth/auth.validation.js";
import { createRateLimiter } from "../middleware/rate-limit.middleware.js";

const authRouter = Router();
const registerLearner = authController.createRegistrationHandler("LEARNER");

const registerInstructor =
  authController.createRegistrationHandler("INSTRUCTOR");

const verificationRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: "Too many verification attempts. Please try again later.",
});

const resendRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  message: "Too many requests. Please try again later.",
});

authRouter.post("/register", validateRegistration, registerLearner);
authRouter.post("/register/learner", validateRegistration, registerLearner);
authRouter.post(
  "/register/instructor",
  validateRegistration,
  registerInstructor,
);
authRouter.post("/login", validateLogin, authController.login);
authRouter.get(
  "/verify-email",
  verificationRateLimit,
  authController.verifyEmail,
);
authRouter.post(
  "/verify-email",
  verificationRateLimit,
  validateVerificationToken,
  authController.verifyEmail,
);

authRouter.post(
  "/resend-verification",
  validateEmailRequest,
  resendRateLimit,
  authController.resendVerification,
);

authRouter.post(
  "/resend-verification-email",
  validateEmailRequest,
  resendRateLimit,
  authController.resendVerification,
);

authRouter.post("/reactivate", validateLogin, authController.reactivateAccount);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", optionalAuthenticate, authController.logout);
authRouter.get("/me", authenticate, authController.getMe);

// Attach your existing authentication rate limiter here.
authRouter.post("/forgot-password", authController.forgotPassword);

export default authRouter;
