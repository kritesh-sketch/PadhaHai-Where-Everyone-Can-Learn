import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

import {
  createCourse,
  getAllCourses,
  getCourseById,
  getCourseBySlug,
  getInstructorCourses,
  updateCourse,
} from "../modules/courses/course.controller.js";

import {
  validateCourseIdParam,
  validateCourseSlugParam,
  validateCreateCourse,
  validateGetCoursesQuery,
  validateInstructorCoursesQuery,
  validateUpdateCourse,
} from "../modules/courses/course.validation.js";

const courseRouter = Router();

/**
 * Adapts a request-data validator to Express middleware.
 */
function validateRequestData(validator, source) {
  return (req, res, next) => {
    const result = validator(req[source] ?? {});

    if (result.errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.errors,
      });
    }

    return next();
  };
}

// Validation middleware
const validateCreateCourseBody = validateRequestData(
  validateCreateCourse,
  "body",
);

const validateUpdateCourseBody = validateRequestData(
  validateUpdateCourse,
  "body",
);

const validatePublicCourseQuery = validateRequestData(
  validateGetCoursesQuery,
  "query",
);

const validateInstructorCourseQuery = validateRequestData(
  validateInstructorCoursesQuery,
  "query",
);

const validateCourseId = validateRequestData(validateCourseIdParam, "params");

const validateCourseSlug = validateRequestData(
  validateCourseSlugParam,
  "params",
);

// All course routes require an authenticated instructor.
courseRouter.use(authenticate, authorizeRoles("INSTRUCTOR"));

// Create a course
courseRouter.post("/", validateCreateCourseBody, createCourse);

// Get all courses
courseRouter.get("/", validatePublicCourseQuery, getAllCourses);

// Get instructor's own courses
courseRouter.get(
  "/my-courses",
  validateInstructorCourseQuery,
  getInstructorCourses,
);

// Get course by slug
courseRouter.get("/slug/:slug", validateCourseSlug, getCourseBySlug);

// Get course by ID
courseRouter.get("/:courseId", validateCourseId, getCourseById);

// Update course
courseRouter.patch(
  "/:courseId",
  validateCourseId,
  validateUpdateCourseBody,
  updateCourse,
);

export default courseRouter;
