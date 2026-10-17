import { Router } from "express";
import { authorizeRoles } from "../middleware/role.middleware.js";
import authenticate, {
  optionalAuthenticate,
} from "../middleware/auth.middleware.js";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  getExploreCategories,
  listCategories,
  getCategoryBySlug,
  getCategoryById,
} from "../modules/categories/category.controller.js";

const adminCategoryRouter = Router();

adminCategoryRouter.get("/categories/explore", getExploreCategories);
adminCategoryRouter.get("/categories", optionalAuthenticate, listCategories);
adminCategoryRouter.get(
  "/categories/slug/:slug",
  optionalAuthenticate,
  getCategoryBySlug,
);
adminCategoryRouter.get(
  "/categories/:categoryId",
  optionalAuthenticate,
  getCategoryById,
);

// Every route here needs a logged-in admin
adminCategoryRouter.use(authenticate, authorizeRoles("ADMIN"));

adminCategoryRouter.post("/categories", createCategory);
adminCategoryRouter.patch("/categories/:categoryId", updateCategory);
adminCategoryRouter.delete("/categories/:categoryId", deleteCategory);

export default adminCategoryRouter;
