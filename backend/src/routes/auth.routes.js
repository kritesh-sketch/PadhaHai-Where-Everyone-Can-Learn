import { Router } from "express";
import * as authController from "../modules/auth/auth.controller.js";
import authenticate from "../middleware/auth.middleware.js";
import {
  validateLogin,
  validateRegistration,
} from "../modules/auth/auth.validation.js";

const authRouter = Router();
const registerLearner = authController.createRegistrationHandler("LEARNER");
const registerInstructor =
  authController.createRegistrationHandler("INSTRUCTOR");

authRouter.post("/register", validateRegistration, registerLearner);
authRouter.post("/register/learner", validateRegistration, registerLearner);
authRouter.post(
  "/register/instructor",
  validateRegistration,
  registerInstructor,
);
authRouter.post("/login", validateLogin, authController.login);
authRouter.post("/reactivate", validateLogin, authController.reactivateAccount);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", authenticate, authController.getMe);

export default authRouter;
