import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { getContinueLearning } from "../modules/progress/progress.controller.js";
import { validateContinueLearningQuery } from "../modules/progress/progress.validation.js";

const progressRouter = Router();

progressRouter.use(authenticate, authorizeRoles("LEARNER"));
progressRouter.get(
  "/continue-learning",
  validateContinueLearningQuery,
  getContinueLearning,
);

export default progressRouter;
