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

const progressRouter = Router();

// 1. Progress Overview
progressRouter.get("/", getEnrolledCourse);
progressRouter.get("/summary", getEnrolledCourse);
progressRouter.get("/statistics", getEnrolledCourse);
progressRouter.get("/insights", getEnrolledCourse);
progressRouter.get("/report", getEnrolledCourse);

// 2. Course Progress
progressRouter.get("/courses", getEnrolledCourse);
progressRouter.get("/courses/:courseId", getEnrolledCourse);
progressRouter.get("/courses/in-progress", getEnrolledCourse);
progressRouter.get("/courses/completed", getEnrolledCourse);
progressRouter.get("/courses/not-started", getEnrolledCourse);
progressRouter.get("/courses/paused", getEnrolledCourse);
progressRouter.get("/courses/completion-history", getEnrolledCourse);
progressRouter.get("/courses/compare", getEnrolledCourse);
progressRouter.get("/courses/recent", getEnrolledCourse);

// 3. Lesson progress
progressRouter.get("/lessons/", getEnrolledCourse);
progressRouter.get("/lessons/completed", getEnrolledCourse);
progressRouter.get("/lessons/incomplete", getEnrolledCourse);
progressRouter.get("/lessons/recent", getEnrolledCourse);
progressRouter.get("/lessons/remaining", getEnrolledCourse);
progressRouter.get("/lessons/history", getEnrolledCourse);

// 4. Learning Activity
progressRouter.get("/progress/activity", getEnrolledCourse);
progressRouter.get("/progress/activity/daily", getEnrolledCourse);
progressRouter.get("/progress/activity/weekly", getEnrolledCourse);
progressRouter.get("/progress/activity/monthly", getEnrolledCourse);
progressRouter.get("/progress/activity/yearly", getEnrolledCourse);
progressRouter.get("/progress/history", getEnrolledCourse);
progressRouter.get("/progress/recent", getEnrolledCourse);
progressRouter.get("/progress/calendar", getEnrolledCourse);

// 5. Learning Time
progressRouter.get("/progress/time/", getEnrolledCourse);
progressRouter.get("/progress/time/daily", getEnrolledCourse);
progressRouter.get("/progress/time/weekly", getEnrolledCourse);
progressRouter.get("/progress/time/monthly", getEnrolledCourse);
progressRouter.get("/progress/time/yearly", getEnrolledCourse);
progressRouter.get("/progress/time/courses", getEnrolledCourse);
progressRouter.get("/progress/time/lessons", getEnrolledCourse);
progressRouter.get("/progress/time/trends", getEnrolledCourse);

// 6. Learning Streak
progressRouter.get("/progress/streak", getEnrolledCourse);
progressRouter.get("/progress/streak/current", getEnrolledCourse);
progressRouter.get("/progress/streak/longest", getEnrolledCourse);
progressRouter.get("/progress/streak/history", getEnrolledCourse);
progressRouter.get("/progress/streak/calendar", getEnrolledCourse);

// 7. Learning Goals
progressRouter.get("/progress/goals", getEnrolledCourse);
progressRouter.get("/progress/goals/create", getEnrolledCourse);
progressRouter.get("/progress/goals/:goalId", getEnrolledCourse);
progressRouter.get("/progress/goals/:goalId/edit", getEnrolledCourse);
progressRouter.get("/progress/goals/completed", getEnrolledCourse);
progressRouter.get("/progress/goals/active", getEnrolledCourse);
progressRouter.get("/progress/goals/history", getEnrolledCourse);

// 8. Quiz Performance
progressRouter.get("/progress/quizzes/", getEnrolledCourse);
progressRouter.get("/progress/quizzes/:quizId", getEnrolledCourse);
progressRouter.get("/progress/quizzes/history", getEnrolledCourse);
progressRouter.get("/progress/quizzes/completed", getEnrolledCourse);
progressRouter.get("/progress/quizzes/pending", getEnrolledCourse);
progressRouter.get("/progress/quizzes/trends", getEnrolledCourse);

// 9. Assessment Performance
progressRouter.get("/progress/assessments", getEnrolledCourse);
progressRouter.get("/progress/assessments/:assessmentId", getEnrolledCourse);
progressRouter.get("/progress/assessments/history", getEnrolledCourse);
progressRouter.get("/progress/assessments/completed", getEnrolledCourse);
progressRouter.get("/progress/assessments/pending", getEnrolledCourse);

// 10. Assignment Progress
progressRouter.get("/progress/assignments/", getEnrolledCourse);
progressRouter.get("/progress/assignments/:assignmentId", getEnrolledCourse);
progressRouter.get("/progress/assignments/submitted", getEnrolledCourse);
progressRouter.get("/progress/assignments/pending", getEnrolledCourse);
progressRouter.get("/progress/assignments/graded", getEnrolledCourse);
progressRouter.get("/progress/assignments/history", getEnrolledCourse);

// 11. Learning Achievements
progressRouter.get("/progress/achievements", getEnrolledCourse);
progressRouter.get("/progress/achievements/:achievementId", getEnrolledCourse);
progressRouter.get("/progress/achievements/earned", getEnrolledCourse);
progressRouter.get("/progress/achievements/locked", getEnrolledCourse);
progressRouter.get("/progress/achievements/history", getEnrolledCourse);
progressRouter.get("/progress/certificates", getEnrolledCourse);
progressRouter.get("/progress/certificates/:certificateId", getEnrolledCourse);
progressRouter.get(
  "/progress/certificates/:certificateId/download",
  getEnrolledCourse,
);
progressRouter.get(
  "/progress/certificates/:certificateId/verify",
  getEnrolledCourse,
);

export default progressRouter;
