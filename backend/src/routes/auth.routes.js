import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import authenticate from "../modules/middleware/auth.middleware.js";
import {
  validateLogin,
  validateRegistration,
} from "../modules/auth/auth.validation.js";

const authRouter = Router();
const registerStudent = authController.createRegistrationHandler("STUDENT");
const registerInstructor =
  authController.createRegistrationHandler("INSTRUCTOR");

authRouter.post("/register", validateRegistration, registerStudent);
authRouter.post("/register/student", validateRegistration, registerStudent);
authRouter.post("/register/instructor", validateRegistration, registerInstructor);
authRouter.post("/login", validateLogin, authController.login);
authRouter.post("/refresh-token", authController.refreshToken);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", authenticate, authController.getMe);
authRouter.get("/get-me", authenticate, authController.getMe);

export default authRouter;
