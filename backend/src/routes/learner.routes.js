import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import {
  getPublishedCourse,
  listPublishedCourses,
} from "../modules/courses/course.controller.js";
import {
  createEnrollment,
  getMyCourseEnrollmentStatus,
  listMyEnrollments,
  markLessonCompleted,
  recordLessonAccess,
  withdrawMyEnrollment,
} from "../modules/enrollments/enrollment.controller.js";
import { listPublishedLessons } from "../modules/lessons/lesson.controller.js";

const learnerRouter = Router();

learnerRouter.use(authenticate, authorizeRoles("LEARNER"));
learnerRouter.get("/dashboard", (req, res) =>
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
learnerRouter.get("/courses", listPublishedCourses);
learnerRouter.get("/courses/:courseId", getPublishedCourse);
learnerRouter.get("/courses/:courseId/enrollment", getMyCourseEnrollmentStatus);
learnerRouter.get("/enrollments", listMyEnrollments);
learnerRouter.post("/courses/:courseId/enrollments", createEnrollment);
learnerRouter.patch(
  "/enrollments/:enrollmentId/withdraw",
  withdrawMyEnrollment,
);
learnerRouter.get("/courses/:courseId/lessons/:lessonId", recordLessonAccess);
learnerRouter.post(
  "/courses/:courseId/lessons/:lessonId/completion",
  markLessonCompleted,
);
learnerRouter.get("/courses/:courseId/lessons", listPublishedLessons);

export default learnerRouter;
