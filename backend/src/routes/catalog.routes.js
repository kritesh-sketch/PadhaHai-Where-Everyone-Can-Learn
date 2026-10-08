import { Router } from "express";
import { authorizeRoles } from "../middleware/role.middleware.js";
import authenticate from "../modules/middleware/auth.middleware.js";
import { listCategories } from "../modules/categories/category.controller.js";

const catalogRouter = Router();

catalogRouter.get(
  "/categories",
  authenticate,
  authorizeRoles("STUDENT", "INSTRUCTOR", "ADMIN"),
  listCategories,
);

export default catalogRouter;
