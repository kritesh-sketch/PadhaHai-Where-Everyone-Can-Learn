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

const lessonRouter = Router();

// 1. Progress Overview
lessonRouter.get("/", getEnrolledCourse);
lessonRouter.get("/summary", getEnrolledCourse);
lessonRouter.get("/statistics", getEnrolledCourse);
lessonRouter.get("/insights", getEnrolledCourse);
lessonRouter.get("/report", getEnrolledCourse);

// 2. Course Progress
lessonRouter.get("/courses", getEnrolledCourse);
lessonRouter.get("/courses/:courseId", getEnrolledCourse);
lessonRouter.get("/courses/in-progress", getEnrolledCourse);
lessonRouter.get("/courses/completed", getEnrolledCourse);
lessonRouter.get("/courses/not-started", getEnrolledCourse);
lessonRouter.get("/courses/paused", getEnrolledCourse);
lessonRouter.get("/courses/completion-history", getEnrolledCourse);
lessonRouter.get("/courses/compare", getEnrolledCourse);
lessonRouter.get("/courses/recent", getEnrolledCourse);

// 3. Lesson progress
lessonRouter.get("/lessons/", getEnrolledCourse);
lessonRouter.get("/lessons/completed", getEnrolledCourse);
lessonRouter.get("/lessons/incomplete", getEnrolledCourse);
lessonRouter.get("/lessons/recent", getEnrolledCourse);
lessonRouter.get("/lessons/remaining", getEnrolledCourse);
lessonRouter.get("/lessons/history", getEnrolledCourse);

// 4. Learning Activity
lessonRouter.get("/progress/activity", getEnrolledCourse);
lessonRouter.get("/progress/activity/daily", getEnrolledCourse);
lessonRouter.get("/progress/activity/weekly", getEnrolledCourse);
lessonRouter.get("/progress/activity/monthly", getEnrolledCourse);
lessonRouter.get("/progress/activity/yearly", getEnrolledCourse);
lessonRouter.get("/progress/history", getEnrolledCourse);
lessonRouter.get("/progress/recent", getEnrolledCourse);
lessonRouter.get("/progress/calendar", getEnrolledCourse);

// 5. Learning Time
lessonRouter.get("/progress/time/", getEnrolledCourse);
lessonRouter.get("/progress/time/daily", getEnrolledCourse);
lessonRouter.get("/progress/time/weekly", getEnrolledCourse);
lessonRouter.get("/progress/time/monthly", getEnrolledCourse);
lessonRouter.get("/progress/time/yearly", getEnrolledCourse);
lessonRouter.get("/progress/time/courses", getEnrolledCourse);
lessonRouter.get("/progress/time/lessons", getEnrolledCourse);
lessonRouter.get("/progress/time/trends", getEnrolledCourse);

// 6. Learning Streak
lessonRouter.get("/progress/streak", getEnrolledCourse);
lessonRouter.get("/progress/streak/current", getEnrolledCourse);
lessonRouter.get("/progress/streak/longest", getEnrolledCourse);
lessonRouter.get("/progress/streak/history", getEnrolledCourse);
lessonRouter.get("/progress/streak/calendar", getEnrolledCourse);

// 7. Learning Goals
lessonRouter.get("/progress/goals", getEnrolledCourse);
lessonRouter.get("/progress/goals/create", getEnrolledCourse);
lessonRouter.get("/progress/goals/:goalId", getEnrolledCourse);
lessonRouter.get("/progress/goals/:goalId/edit", getEnrolledCourse);
lessonRouter.get("/progress/goals/completed", getEnrolledCourse);
lessonRouter.get("/progress/goals/active", getEnrolledCourse);
lessonRouter.get("/progress/goals/history", getEnrolledCourse);

// 8. Quiz Performance
lessonRouter.get("/progress/quizzes/", getEnrolledCourse);
lessonRouter.get("/progress/quizzes/:quizId", getEnrolledCourse);
lessonRouter.get("/progress/quizzes/history", getEnrolledCourse);
lessonRouter.get("/progress/quizzes/completed", getEnrolledCourse);
lessonRouter.get("/progress/quizzes/pending", getEnrolledCourse);
lessonRouter.get("/progress/quizzes/trends", getEnrolledCourse);

// 9. Assessment Performance
lessonRouter.get("/progress/assessments", getEnrolledCourse);
lessonRouter.get("/progress/assessments/:assessmentId", getEnrolledCourse);
lessonRouter.get("/progress/assessments/history", getEnrolledCourse);
lessonRouter.get("/progress/assessments/completed", getEnrolledCourse);
lessonRouter.get("/progress/assessments/pending", getEnrolledCourse);

// 10. Assignment Progress
lessonRouter.get("/progress/assignments/", getEnrolledCourse);
lessonRouter.get("/progress/assignments/:assignmentId", getEnrolledCourse);
lessonRouter.get("/progress/assignments/submitted", getEnrolledCourse);
lessonRouter.get("/progress/assignments/pending", getEnrolledCourse);
lessonRouter.get("/progress/assignments/graded", getEnrolledCourse);
lessonRouter.get("/progress/assignments/history", getEnrolledCourse);

// 11. Learning Achievements
lessonRouter.get("/progress/achievements", getEnrolledCourse);
lessonRouter.get("/progress/achievements/:achievementId", getEnrolledCourse);
lessonRouter.get("/progress/achievements/earned", getEnrolledCourse);
lessonRouter.get("/progress/achievements/locked", getEnrolledCourse);
lessonRouter.get("/progress/achievements/history", getEnrolledCourse);
lessonRouter.get("/progress/certificates", getEnrolledCourse);
lessonRouter.get("/progress/certificates/:certificateId", getEnrolledCourse);
lessonRouter.get(
  "/progress/certificates/:certificateId/download",
  getEnrolledCourse,
);
lessonRouter.get(
  "/progress/certificates/:certificateId/verify",
  getEnrolledCourse,
);

export default lessonRouter;
