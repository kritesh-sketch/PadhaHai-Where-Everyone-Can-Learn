import { Router } from "express";

import authenticate from "../../common/middleware/auth.middleware.js";
import { authorizeRoles } from "../../common/middleware/role.middleware.js";

import {
  getCourseLessons,
  getModuleLessons,
  getLessonById,
  getLessonContent,
  getLessonPreview,
  getLessonResources,
  getLessonActivities,
  getNextLesson,
  getPreviousLesson,
  createLesson,
  updateLesson,
  deleteLesson,
  publishLesson,
  unpublishLesson,
  reorderLessons,
} from "./lesson.controller.js";

const router = Router();

// Learner routes
router.get(
  "/courses/:courseId",
  authenticate,
  authorizeRoles("LEARNER"),
  getCourseLessons,
);

router.get(
  "/courses/:courseId/modules/:moduleId",
  authenticate,
  authorizeRoles("LEARNER"),
  getModuleLessons,
);

router.get("/courses/:courseId/:lessonId/preview", getLessonPreview);

router.get(
  "/courses/:courseId/:lessonId",
  authenticate,
  authorizeRoles("LEARNER"),
  getLessonById,
);

router.get(
  "/courses/:courseId/:lessonId/content",
  authenticate,
  authorizeRoles("LEARNER"),
  getLessonContent,
);

router.get(
  "/courses/:courseId/:lessonId/resources",
  authenticate,
  authorizeRoles("LEARNER"),
  getLessonResources,
);

router.get(
  "/courses/:courseId/:lessonId/activities",
  authenticate,
  authorizeRoles("LEARNER"),
  getLessonActivities,
);

router.get(
  "/courses/:courseId/:lessonId/next",
  authenticate,
  authorizeRoles("LEARNER"),
  getNextLesson,
);

router.get(
  "/courses/:courseId/:lessonId/previous",
  authenticate,
  authorizeRoles("LEARNER"),
  getPreviousLesson,
);

// Instructor routes
router.post(
  "/courses/:courseId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  createLesson,
);

router.patch(
  "/:lessonId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  updateLesson,
);

router.delete(
  "/:lessonId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  deleteLesson,
);

router.patch(
  "/:lessonId/publish",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  publishLesson,
);

router.patch(
  "/:lessonId/unpublish",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  unpublishLesson,
);

router.patch(
  "/courses/:courseId/reorder",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  reorderLessons,
);

export default router;
