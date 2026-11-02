import mongoose from "mongoose";
import enrollmentModel from "../enrollments/enrollment.model.js";
import courseModel, { COURSE_LEVELS, COURSE_STATUSES } from "./course.model.js";
import {
  CourseServiceError,
  createCourse as createCourseService,
  getAllCourses as getAllCoursesService,
  getCourseById as getCourseByIdService,
  getCourseBySlug as getCourseBySlugService,
  getInstructorCourses as getInstructorCoursesService,
  updateCourse as updateCourseService,
} from "./course.service.js";

function handleCourseServiceError(error, res, next) {
  if (error instanceof CourseServiceError) {
    return res.status(error.statusCode).json({
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  return next(error);
}

/**
 * Escapes special characters in a string for safe use in a regular expression.
 *
 * Prefixes regular expression metacharacters with a backslash so they
 * are treated as literal characters rather than pattern operators.
 *
 * @param {string} value - The string to escape.
 * @returns {string} The escaped string suitable for use in a regular expression.
 */
function escapeRegex(value) {
  // Escape regular expression metacharacters to ensure literal matching.
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validates and parses course listing query parameters.
 *
 * Supports pagination, sorting, text search, and filtering by category,
 * instructor, language, course level, and status. Builds a database query
 * from the validated parameters and returns any validation errors.
 *
 * @param {Object} req - The request object containing course listing query parameters.
 * @param {Object} [options={}] - Configuration options for the query parser.
 * @param {string[]} [options.statuses] - The course statuses permitted by the calling endpoint.
 * @param {string} [options.defaultSort="createdAt"] - The default field used to sort results.
 * @returns {Object} The validation errors or the parsed query, pagination, and sorting options.
 */
function parseCourseListQuery(
  req,
  { statuses, defaultSort = "createdAt" } = {},
) {
  // Extract supported filters and sorting options from the request query.
  const {
    category,
    instructor,
    language,
    level,
    search: rawSearch,
    sortBy = defaultSort,
    sortOrder = "desc",
    status,
  } = req.query;

  // Apply default pagination values and support both search and q parameters.
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 20);
  const search = rawSearch ?? req.query.q ?? "";
  const errors = [];

  // Validate pagination parameters to prevent invalid database queries.
  if (!Number.isInteger(page) || page < 1) {
    errors.push({ field: "page", message: "Must be a positive integer" });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.push({
      field: "limit",
      message: "Must be an integer from 1 to 100",
    });
  }

  // Validate the search term and restrict its maximum length.
  if (typeof search !== "string" || search.length > 100) {
    errors.push({ field: "search", message: "Must be at most 100 characters" });
  }

  // Restrict sorting to supported fields and directions.
  if (!["createdAt", "updatedAt", "title"].includes(sortBy)) {
    errors.push({
      field: "sortBy",
      message: "Must be one of: createdAt, updatedAt, title",
    });
  }
  if (!["asc", "desc"].includes(sortOrder)) {
    errors.push({ field: "sortOrder", message: "Must be asc or desc" });
  }

  // Validate the requested course level against the supported levels.
  if (level !== undefined && !COURSE_LEVELS.includes(level)) {
    errors.push({
      field: "level",
      message: `Must be one of: ${COURSE_LEVELS.join(", ")}`,
    });
  }

  // Validate the category ID unless the special "none" filter is requested.
  if (
    category !== undefined &&
    category !== "none" &&
    !mongoose.isValidObjectId(category)
  ) {
    errors.push({ field: "category", message: "Must be a valid category ID" });
  }

  // Ensure the instructor filter contains a valid MongoDB ObjectId.
  if (instructor !== undefined && !mongoose.isValidObjectId(instructor)) {
    errors.push({
      field: "instructor",
      message: "Must be a valid instructor ID",
    });
  }

  // Validate the optional language filter and its maximum length.
  if (
    language !== undefined &&
    (typeof language !== "string" || language.trim().length > 60)
  ) {
    errors.push({
      field: "language",
      message: "Must be a string of at most 60 characters",
    });
  }

  // Restrict status filtering to the statuses permitted by the calling endpoint.
  if (status !== undefined && !statuses?.includes(status)) {
    errors.push({
      field: "status",
      message: `Must be one of: ${(statuses ?? []).join(", ")}`,
    });
  }

  // Stop processing when any query parameter fails validation.
  if (errors.length) {
    return { errors };
  }

  const filters = [];

  // Apply endpoint-specific status restrictions before optional status filters.
  if (statuses?.length === 1) {
    filters.push({ status: statuses[0] });
  } else if (status) {
    filters.push({ status });
  } else if (statuses?.length) {
    filters.push({ status: { $in: statuses } });
  }

  // Filter courses by category, including courses without an assigned category.
  if (category) {
    filters.push(category === "none" ? { category: null } : { category });
  }

  // Apply the optional instructor and course-level filters.
  if (instructor) filters.push({ instructor });
  if (level) filters.push({ level });

  // Match the specified language without case sensitivity.
  if (language?.trim()) {
    filters.push({
      language: new RegExp(`^${escapeRegex(language.trim())}$`, "i"),
    });
  }

  // Search course titles and descriptions using a case-insensitive literal match.
  if (search.trim()) {
    const expression = new RegExp(escapeRegex(search.trim()), "i");
    filters.push({
      $or: [{ title: expression }, { description: expression }],
    });
  }

  // Combine filters and return the validated pagination and sorting configuration.
  return {
    errors,
    query: filters.length > 1 ? { $and: filters } : (filters[0] ?? {}),
    page,
    limit,
    sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 },
  };
}

/**
 * Retrieves a paginated list of courses matching the specified filters.
 *
 * Validates the listing query parameters, fetches the matching courses
 * with their category and instructor details, and returns pagination
 * metadata alongside the course records.
 *
 * @param {Object} req - The request object containing filtering, sorting, and pagination parameters.
 * @param {Object} res - The response object used to return the course list or validation errors.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @param {Object} options - Configuration options for validating and filtering course statuses.
 * @returns {Promise<Object|void>} The paginated course list or the result of error forwarding.
 */
async function listCourses(req, res, next, options) {
  // Validate the query parameters before executing database operations.
  const parsed = parseCourseListQuery(req, options);

  // Return a validation error response when any query parameter is invalid.
  if (parsed.errors.length) {
    return res
      .status(400)
      .json({ message: "Validation failed", errors: parsed.errors });
  }

  try {
    // Build the course query with category and instructor details, sorting, and pagination.
    const query = courseModel
      .find(parsed.query)
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username")
      .sort(parsed.sort)
      .skip((parsed.page - 1) * parsed.limit)
      .limit(parsed.limit);

    // Fetch the current page of courses and the total number of matching records concurrently.
    const [courses, total] = await Promise.all([
      query.lean(),
      courseModel.countDocuments(parsed.query),
    ]);

    // Return the course records and pagination metadata.
    return res.json({
      courses,
      pagination: {
        page: parsed.page,
        limit: parsed.limit,
        total,
        totalPages: Math.ceil(total / parsed.limit),
      },
    });
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}

/**
 * Creates a course for the authenticated instructor.
 *
 * @param {Object} req - The request containing the instructor and course body.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The created course response.
 */
export async function createCourse(req, res, next) {
  try {
    const course = await createCourseService(req.user?._id, req.body ?? {});
    return res.status(201).json({ course });
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Updates a course using only the authenticated instructor's permitted fields.
 *
 * @param {Object} req - The request containing course ID, instructor, and updates.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The updated course response.
 */
export async function updateCourse(req, res, next) {
  try {
    const course = await updateCourseService(
      req.params.courseId,
      req.user?._id,
      req.body ?? {},
    );
    return res.json({ course });
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Retrieves a course by ID after applying service-level access rules.
 *
 * @param {Object} req - The request containing the course ID and optional viewer.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The requested course response.
 */
export async function getCourseById(req, res, next) {
  try {
    const course = await getCourseByIdService(
      req.params.courseId,
      req.user ?? null,
    );
    return res.json({ course });
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Retrieves a course by slug after applying service-level access rules.
 *
 * @param {Object} req - The request containing the course slug and optional viewer.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The requested course response.
 */
export async function getCourseBySlug(req, res, next) {
  try {
    const course = await getCourseBySlugService(
      req.params.slug,
      req.user ?? null,
    );
    return res.json({ course });
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Returns the public course catalog and its pagination metadata.
 *
 * @param {Object} req - The request containing catalog query parameters.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The public course list response.
 */
export async function getAllCourses(req, res, next) {
  try {
    const result = await getAllCoursesService(req.query ?? {});
    return res.json(result);
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Returns courses owned by the authenticated instructor.
 *
 * @param {Object} req - The request containing instructor and listing filters.
 * @param {Object} res - The response object.
 * @param {Function} next - The centralized error middleware callback.
 * @returns {Promise<Object|void>} The instructor course list response.
 */
export async function getInstructorCourses(req, res, next) {
  try {
    const result = await getInstructorCoursesService(
      req.user?._id,
      req.query ?? {},
    );
    return res.json(result);
  } catch (error) {
    return handleCourseServiceError(error, res, next);
  }
}

/**
 * Retrieves the learner-facing public course catalog.
 *
 * @param {Object} req - The request object containing course listing query parameters.
 * @param {Object} res - The response object used to return the published courses.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The public course list or the result of error forwarding.
 */
export async function listPublishedCourses(req, res, next) {
  return getAllCourses(req, res, next);
}

/**
 * Retrieves a course by ID using the service's visibility rules.
 *
 * @param {Object} req - The request object containing the course ID.
 * @param {Object} res - The response object used to return the course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The accessible course or the result of error forwarding.
 */
export async function getPublishedCourse(req, res, next) {
  return getCourseById(req, res, next);
}

/**
 * Compatibility handler for the instructor course listing route.
 *
 * @param {Object} req - The request object containing the authenticated instructor and query parameters.
 * @param {Object} res - The response object used to return the course list or validation errors.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The instructor course list or the result of error forwarding.
 */
export async function listInstructorCourses(req, res, next) {
  return getInstructorCourses(req, res, next);
}

/**
 * Compatibility handler for the instructor course update route.
 *
 * @param {Object} req - The request object containing the authenticated instructor, course ID, and update data.
 * @param {Object} res - The response object used to return the updated course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated course or the result of error forwarding.
 */
export async function updateInstructorCourse(req, res, next) {
  return updateCourse(req, res, next);
}

/**
 * Updates the status of a course owned by the authenticated instructor.
 *
 * Validates the course ID and requested status, allowing instructors
 * to set their courses to draft or archived. Updates the matching course
 * and returns the updated record.
 *
 * @param {Object} req - The request object containing the authenticated instructor, course ID, and requested status.
 * @param {Object} res - The response object used to return the updated course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated course or the result of error forwarding.
 */
export async function updateInstructorCourseStatus(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  // Extract the requested status from the request body.
  const { status } = req.body ?? {};

  // Restrict instructors to the permitted course status transitions.
  if (!["DRAFT", "ARCHIVED"].includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: "Instructors may set a course to DRAFT or ARCHIVED",
        },
      ],
    });
  }

  try {
    // Update the status only if the course belongs to the authenticated instructor.
    const course = await courseModel.findOneAndUpdate(
      { _id: req.params.courseId, instructor: req.user._id },
      { $set: { status } },
      { new: true, runValidators: true },
    );

    // Return a not-found response if the course does not exist or is not owned by the instructor.
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Return the updated course record.
    return res.json({ course });
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}

/**
 * Deletes a course owned by the authenticated instructor.
 *
 * Validates the course ID, verifies course ownership, and prevents deletion
 * when enrollment records exist. Courses with enrollments must be archived
 * instead to preserve learner enrollment records and course history.
 *
 * @param {Object} req - The request object containing the authenticated instructor and course ID.
 * @param {Object} res - The response object used to return the deletion result or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} A successful deletion response or the result of error forwarding.
 */
export async function deleteInstructorCourse(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  try {
    // Verify that the requested course exists and belongs to the authenticated instructor.
    const ownedCourse = await courseModel.exists({
      _id: req.params.courseId,
      instructor: req.user._id,
    });

    // Return a not-found response if the course does not exist or is not owned by the instructor.
    if (!ownedCourse) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check whether the course has enrollment records that must be preserved.
    const hasEnrollments = await enrollmentModel.exists({
      course: req.params.courseId,
    });

    // Prevent deletion when enrollments exist and recommend archiving the course instead.
    if (hasEnrollments) {
      return res.status(409).json({
        message:
          "Courses with enrollments cannot be deleted; archive the course instead",
      });
    }

    // Delete the course only if it still belongs to the authenticated instructor.
    const course = await courseModel.findOneAndDelete({
      _id: req.params.courseId,
      instructor: req.user._id,
    });

    // Handle cases where the course is no longer available for deletion.
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Return HTTP 204 to indicate successful deletion without a response body.
    return res.status(204).end();
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}

/**
 * Retrieves a paginated list of courses for administrative moderation.
 *
 * Defaults the status filter to draft courses when no status is specified
 * and delegates validation, filtering, sorting, and pagination to the
 * shared course listing handler. Supports filtering across all valid
 * course statuses.
 *
 * @param {Object} req - The request object containing moderation query parameters.
 * @param {Object} res - The response object used to return the course list.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The paginated moderation course list or the result of error forwarding.
 */
export async function listCoursesForModeration(req, res, next) {
  // Default to draft courses when the request does not specify a status.
  const reqWithDefaultStatus = {
    ...req,
    query: { ...req.query, status: req.query.status ?? "DRAFT" },
  };

  // Delegate course retrieval using the supported course statuses.
  return listCourses(reqWithDefaultStatus, res, next, {
    statuses: COURSE_STATUSES,
  });
}

/**
 * Updates a course's status during administrative moderation.
 *
 * Validates the course ID and requested status before updating the course.
 * Supports approving, rejecting, archiving, or returning a course to draft.
 * Database validation is enabled to ensure the update follows the course schema.
 *
 * @param {Object} req - The request object containing the course ID and requested status.
 * @param {Object} res - The response object used to return the updated course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated course response or the result of error forwarding.
 */
export async function moderateCourse(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  // Extract the requested status while safely handling a missing request body.
  const { status } = req.body ?? {};

  // Ensure the requested status belongs to the supported moderation states.
  if (!["DRAFT", "PUBLISHED", "ARCHIVED", "REJECTED"].includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: "Must be DRAFT, PUBLISHED, ARCHIVED, or REJECTED",
        },
      ],
    });
  }

  try {
    // Update the course status and return the updated document with schema validation enabled.
    const course = await courseModel.findByIdAndUpdate(
      req.params.courseId,
      { $set: { status } },
      { new: true, runValidators: true },
    );

    // Return a not-found response when the requested course does not exist.
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Return the updated course to the administrator.
    return res.json({ course });
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}
