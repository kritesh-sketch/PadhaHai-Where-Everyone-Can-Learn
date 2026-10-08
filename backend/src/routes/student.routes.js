import { Router } from "express";
import authenticate from "../modules/middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import {
  getPublishedCourse,
  listPublishedCourses,
} from "../modules/courses/course.controller.js";
import { listPublishedLessons } from "../modules/lessons/lesson.controller.js";

const studentRouter = Router();

studentRouter.use(authenticate, authorizeRoles("STUDENT"));
studentRouter.get("/dashboard", (req, res) =>
  res.json({
    dashboard: {
      user: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role,
      },
    },
  }),
);
studentRouter.get("/courses", listPublishedCourses);
studentRouter.get("/courses/:courseId", getPublishedCourse);
studentRouter.get("/courses/:courseId/lessons", listPublishedLessons);

export default studentRouter;
