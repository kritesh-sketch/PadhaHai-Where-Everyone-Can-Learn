import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import * as adminController from "../modules/admin/admin.controller.js";
import * as userController from "../modules/users/user.controller.js";
import * as categoryController from "../modules/categories/category.controller.js";
import { validateUserIdParam } from "../modules/users/user.validation.js";
import {
  listCoursesForModeration,
  moderateCourse,
} from "../modules/courses/course.controller.js";
import {
  getCourseEnrollments,
  updateEnrollmentStatus,
} from "../modules/enrollments/enrollment.controller.js";
import {
  listLessonsForModeration,
  moderateLesson,
} from "../modules/lessons/lesson.controller.js";

const adminRouter = Router();

adminRouter.use(authenticate, authorizeRoles("ADMIN"));
adminRouter.get("/dashboard", adminController.getDashboard);
adminRouter.get("/users", adminController.listUsers);
adminRouter.get(
  "/users/:userId",
  validateUserIdParam,
  userController.getUserDetails,
);
adminRouter.patch("/users/:userId", adminController.updateUser);
adminRouter.get("/categories", categoryController.listCategories);
adminRouter.get("/categories/:categoryId", categoryController.getCategoryById);
adminRouter.post("/categories", categoryController.createCategory);
adminRouter.patch("/categories/:categoryId", categoryController.updateCategory);
adminRouter.delete("/categories/:categoryId", categoryController.deleteCategory);
adminRouter.get("/courses", listCoursesForModeration);
adminRouter.patch("/courses/:courseId/moderation", moderateCourse);
adminRouter.get("/courses/:courseId/enrollments", getCourseEnrollments);
adminRouter.patch(
  "/enrollments/:enrollmentId/status",
  updateEnrollmentStatus,
);
adminRouter.get("/lessons", listLessonsForModeration);
adminRouter.patch("/lessons/:lessonId/moderation", moderateLesson);

export default adminRouter;
