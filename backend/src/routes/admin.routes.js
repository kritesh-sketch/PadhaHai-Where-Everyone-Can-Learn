import { Router } from "express";
import authenticate from "../modules/middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import * as authController from "../controllers/auth.controller.js";
import * as adminController from "../modules/admin/admin.controller.js";
import * as categoryController from "../modules/categories/category.controller.js";
import {
  listCoursesForModeration,
  moderateCourse,
} from "../modules/courses/course.controller.js";
import {
  listLessonsForModeration,
  moderateLesson,
} from "../modules/lessons/lesson.controller.js";

const adminRouter = Router();

adminRouter.use(authenticate, authorizeRoles("ADMIN"));
adminRouter.get("/dashboard", adminController.getDashboard);
adminRouter.get("/users", authController.listUsers);
adminRouter.patch("/users/:userId", adminController.updateUser);
adminRouter.get("/categories", categoryController.listCategories);
adminRouter.post("/categories", categoryController.createCategory);
adminRouter.patch("/categories/:categoryId", categoryController.updateCategory);
adminRouter.delete("/categories/:categoryId", categoryController.deleteCategory);
adminRouter.get("/courses", listCoursesForModeration);
adminRouter.patch("/courses/:courseId/moderation", moderateCourse);
adminRouter.get("/lessons", listLessonsForModeration);
adminRouter.patch("/lessons/:lessonId/moderation", moderateLesson);

export default adminRouter;
