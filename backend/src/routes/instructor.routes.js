import { Router } from "express";
import authenticate from "../modules/middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import {
  createCourse,
  deleteInstructorCourse,
  listInstructorCourses,
  updateInstructorCourse,
} from "../modules/courses/course.controller.js";
import {
  createLesson,
  deleteLesson,
  listInstructorLessons,
  updateLesson,
} from "../modules/lessons/lesson.controller.js";

const instructorRouter = Router();

instructorRouter.use(authenticate, authorizeRoles("INSTRUCTOR"));
instructorRouter.get("/courses", listInstructorCourses);
instructorRouter.post("/courses", createCourse);
instructorRouter.patch("/courses/:courseId", updateInstructorCourse);
instructorRouter.delete("/courses/:courseId", deleteInstructorCourse);
instructorRouter.get("/courses/:courseId/lessons", listInstructorLessons);
instructorRouter.post("/courses/:courseId/lessons", createLesson);
instructorRouter.patch(
  "/courses/:courseId/lessons/:lessonId",
  updateLesson,
);
instructorRouter.delete(
  "/courses/:courseId/lessons/:lessonId",
  deleteLesson,
);

export default instructorRouter;
