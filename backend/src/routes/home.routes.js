import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { validateContinueLearningQuery } from "../modules/progress/progress.validation.js";
import { getHome } from "../modules/home/home.controller.js";

const homeRouter = Router();

// Only authenticated learners can access the homepage.
homeRouter.use(authenticate, authorizeRoles("LEARNER"));

homeRouter.get("/", validateContinueLearningQuery, getHome);

export default homeRouter;
