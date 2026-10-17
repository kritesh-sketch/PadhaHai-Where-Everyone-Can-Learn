import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import * as userController from "../modules/users/user.controller.js";
import profilePictureUpload from "../middleware/profile-picture-upload.middleware.js";
import { validateUserIdParam } from "../modules/users/user.validation.js";

const userRouter = Router();

userRouter.use(authenticate);
userRouter.get("/me", userController.getProfile);
userRouter.patch("/me", userController.updateProfile);
userRouter.patch("/me/interests", userController.updateInterests);
userRouter.patch("/me/password", userController.changePassword);
userRouter.patch("/me/status", userController.deactivateAccount);
userRouter.post(
  "/me/profile-picture",
  profilePictureUpload,
  userController.uploadPicture,
);
userRouter.get("/:userId", validateUserIdParam, userController.getUserDetails);

export default userRouter;