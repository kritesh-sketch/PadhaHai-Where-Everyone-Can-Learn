import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

import {
  enrollInCourse,
  getMyEnrollments,
  getMyActiveEnrollments,
  getMyCompletedEnrollments,
  getMyWithdrawnEnrollments,
  getMySuspendedEnrollments,
  getMyEnrollmentHistory,
  getEnrollmentById,
  withdrawFromCourse,
  deleteEnrollment,
  checkCourseEnrollment,
  getEnrollmentStatus,
} from "../modules/enrollments/enrollment.controller.js";

const enrollmentRouter = Router();

enrollmentRouter.use(authenticate);
enrollmentRouter.use(authorizeRoles("LEARNER"));

// Enrollment creation
enrollmentRouter.post("/", enrollInCourse);

// My enrollments
enrollmentRouter.get("/my-enrollments", getMyEnrollments);
enrollmentRouter.get("/my-enrollments/active", getMyActiveEnrollments);
enrollmentRouter.get("/my-enrollments/completed", getMyCompletedEnrollments);
enrollmentRouter.get("/my-enrollments/withdrawn", getMyWithdrawnEnrollments);
enrollmentRouter.get("/my-enrollments/suspended", getMySuspendedEnrollments);
enrollmentRouter.get("/my-enrollments/history", getMyEnrollmentHistory);

// Check enrollment
enrollmentRouter.get("/course/:courseId", checkCourseEnrollment);

// Enrollment details
enrollmentRouter.get("/:enrollmentId", getEnrollmentById);
enrollmentRouter.get("/:enrollmentId/status", getEnrollmentStatus);

// Enrollment actions
enrollmentRouter.patch("/:enrollmentId/withdraw", withdrawFromCourse);

// Permanently delete enrollment (if allowed)
enrollmentRouter.delete("/:enrollmentId", deleteEnrollment);

// Get all enrollments for a specific course
enrollmentRouter.get("/course/:courseId", getCourseEnrollments);

// Get enrollment status
enrollmentRouter.get("/:enrollmentId/status", getEnrollmentStatus);

// Get course details through enrollment
enrollmentRouter.get("/:enrollmentId/course", getEnrolledCourse);

export default enrollmentRouter;
