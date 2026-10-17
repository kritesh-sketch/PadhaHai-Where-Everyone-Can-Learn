import mongoose from "mongoose";
import categoryModel from "../categories/category.model.js";
import enrollmentModel from "../enrollments/enrollment.model.js";
import courseModel, { COURSE_LEVELS, COURSE_STATUSES } from "./course.model.js";

/**
 * Converts a string into a URL-friendly slug.
 *
 * Normalizes the input to lowercase, replaces consecutive non-alphanumeric
 * characters with hyphens, and removes leading or trailing hyphens.
 *
 * @param {string} value - The string to convert into a slug.
 * @returns {string} The normalized, URL-friendly slug.
 */
function createSlug(value) {
  // Normalize the string to lowercase and replace non-alphanumeric sequences with hyphens.
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      // Remove leading and trailing hyphens from the generated slug.
      .replace(/^-|-$/g, "")
  );
}

/**
 * Validates and parses course input data.
 *
 * Supports both full course creation and partial course updates.
 * Validates course fields, normalizes string values, generates a slug
 * from the course title when appropriate, and collects validation errors.
 *
 * @param {Object} body - The request body containing course data.
 * @param {boolean} [partial=false] - Whether to validate only the fields provided.
 * @returns {{ input: Object, errors: Array<{ field: string, message: string }> }} The validated course data and any validation errors.
 */
function parseCourseInput(body, partial = false) {
  const input = {};
  const errors = [];

  // Validate the title and description according to their length constraints.
  for (const [field, options] of Object.entries({
    title: { minimum: 3, maximum: 160 },
    description: { minimum: 10, maximum: 10000 },
  })) {
    // Skip fields that are not provided during a partial update.
    if (partial && body[field] === undefined) {
      continue;
    }

    // Reject values that are not strings or fall outside the allowed length range.
    if (
      typeof body[field] !== "string" ||
      body[field].trim().length < options.minimum ||
      body[field].trim().length > options.maximum
    ) {
      errors.push({
        field,
        message: `Must be between ${options.minimum} and ${options.maximum} characters`,
      });
    } else {
      // Store the validated string without leading or trailing whitespace.
      input[field] = body[field].trim();
    }
  }

  // Validate the supplied slug or generate one from the course title when appropriate.
  if (body.slug !== undefined || (!partial && input.title)) {
    const slug = body.slug === undefined ? createSlug(input.title) : body.slug;

    // Ensure the slug contains valid characters and does not exceed the maximum length.
    if (typeof slug !== "string" || !createSlug(slug) || slug.length > 180) {
      errors.push({
        field: "slug",
        message:
          "Must contain 1 to 180 letters or numbers separated by hyphens",
      });
    } else {
      // Normalize the slug before adding it to the validated input.
      input.slug = createSlug(slug);
    }
  } else if (partial && input.title && body.slug === undefined) {
    // Regenerate the slug when the title changes without an explicit slug.
    input.slug = createSlug(input.title);
  }

  // Validate the optional thumbnail value and enforce its maximum length.
  if (body.thumbnail !== undefined) {
    if (
      typeof body.thumbnail !== "string" ||
      body.thumbnail.trim().length > 2048
    ) {
      errors.push({
        field: "thumbnail",
        message: "Must be a string of at most 2048 characters",
      });
    } else {
      input.thumbnail = body.thumbnail.trim();
    }
  }

  // Ensure the course level matches one of the supported values.
  if (body.level !== undefined) {
    if (!COURSE_LEVELS.includes(body.level)) {
      errors.push({
        field: "level",
        message: `Must be one of: ${COURSE_LEVELS.join(", ")}`,
      });
    } else {
      input.level = body.level;
    }
  }

  // Validate the course language and normalize whitespace.
  if (body.language !== undefined) {
    if (
      typeof body.language !== "string" ||
      body.language.trim().length < 1 ||
      body.language.trim().length > 60
    ) {
      errors.push({
        field: "language",
        message: "Must be between 1 and 60 characters",
      });
    } else {
      input.language = body.language.trim();
    }
  }

  // Preserve the existing category unless a category value is explicitly provided.
  if (body.category === undefined) {
    return { input, errors };
  }

  // Allow the category to be cleared by explicitly providing null or an empty string.
  if (body.category === null || body.category === "") {
    input.category = null;
  } else if (
    typeof body.category === "string" &&
    mongoose.isValidObjectId(body.category)
  ) {
    // Store the validated category ID.
    input.category = body.category;
  } else {
    // Reject category values that are not valid MongoDB ObjectId strings.
    errors.push({ field: "category", message: "Must be a valid category ID" });
  }

  // Return the validated fields alongside any collected validation errors.
  return { input, errors };
}

/**
 * Checks whether the specified course category exists.
 *
 * Treats an omitted category ID as valid and queries the database
 * to verify the existence of a category when an ID is provided.
 *
 * @param {string|null|undefined} categoryId - The ID of the category to validate.
 * @returns {Promise<boolean|Object>} True when no category is specified, or the matching category's existence result.
 */
async function validateCategory(categoryId) {
  // Accept courses without an assigned category.
  // Otherwise, verify that the category exists in the database.
  return !categoryId || (await categoryModel.exists({ _id: categoryId }));
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
 * Retrieves a paginated list of published courses.
 *
 * Delegates query validation, filtering, sorting, and pagination
 * to the shared course listing handler while restricting results
 * to courses with a published status.
 *
 * @param {Object} req - The request object containing course listing query parameters.
 * @param {Object} res - The response object used to return the published courses.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The paginated list of published courses or the result of error forwarding.
 */
export async function listPublishedCourses(req, res, next) {
  // Restrict the course listing to published courses.
  return listCourses(req, res, next, { statuses: ["PUBLISHED"] });
}

/**
 * Retrieves a published course by its ID.
 *
 * Validates the course ID, fetches the matching published course with
 * its category and instructor details, and returns the course record.
 * Returns an appropriate error response when the ID is invalid or
 * the published course cannot be found.
 *
 * @param {Object} req - The request object containing the course ID.
 * @param {Object} res - The response object used to return the course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The published course or the result of error forwarding.
 */
export async function getPublishedCourse(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  try {
    // Retrieve the published course with its category and instructor details.
    const course = await courseModel
      .findOne({ _id: req.params.courseId, status: "PUBLISHED" })
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username")
      .lean();

    // Return a not-found response when no published course matches the ID.
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Return the published course details.
    return res.json({ course });
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}

/**
 * Retrieves a paginated list of courses created by the authenticated instructor.
 *
 * Validates the listing query parameters, restricts results to courses
 * owned by the authenticated instructor, and supports filtering, sorting,
 * and pagination. Returns the matching courses with category details
 * and pagination metadata.
 *
 * @param {Object} req - The request object containing the authenticated instructor and query parameters.
 * @param {Object} res - The response object used to return the course list or validation errors.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The paginated instructor course list or the result of error forwarding.
 */
export async function listInstructorCourses(req, res, next) {
  // Validate query parameters and allow the supported course statuses.
  const parsed = parseCourseListQuery(req, { statuses: COURSE_STATUSES });

  // Reject the request if any listing parameter fails validation.
  if (parsed.errors.length) {
    return res
      .status(400)
      .json({ message: "Validation failed", errors: parsed.errors });
  }

  // Restrict results to courses owned by the authenticated instructor.
  const query = {
    $and: [parsed.query, { instructor: req.user._id }],
  };

  try {
    // Retrieve the instructor's courses with category details, sorting, and pagination.
    const [courses, total] = await Promise.all([
      courseModel
        .find(query)
        .populate("category", "name slug")
        .sort(parsed.sort)
        .skip((parsed.page - 1) * parsed.limit)
        .limit(parsed.limit)
        .lean(),
      courseModel.countDocuments(query),
    ]);

    // Return the matching courses and pagination metadata.
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
 * Creates a new course for the authenticated instructor.
 *
 * Validates the submitted course data, verifies that the specified category
 * exists, and creates the course with an initial draft status. Handles
 * duplicate course slugs and forwards unexpected errors to error middleware.
 *
 * @param {Object} req - The request object containing the authenticated instructor and course data.
 * @param {Object} res - The response object used to return the created course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The created course or the result of error forwarding.
 */
export async function createCourse(req, res, next) {
  // Validate and normalize the submitted course data.
  const { input, errors } = parseCourseInput(req.body ?? {});

  // Reject the request when course data fails validation.
  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    // Verify that the specified category exists before creating the course.
    if (!(await validateCategory(input.category))) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "category", message: "Category does not exist" }],
      });
    }

    // Create the course under the authenticated instructor with draft status.
    const course = await courseModel.create({
      ...input,
      instructor: req.user._id,
      status: "DRAFT",
    });

    // Return the newly created course with HTTP 201 Created.
    return res.status(201).json({ course });
  } catch (error) {
    // Return a conflict response when the course slug violates a unique constraint.
    if (error.code === 11000) {
      return res.status(409).json({ message: "Course slug already exists" });
    }

    // Forward unexpected database and application errors to centralized error-handling middleware.
    return next(error);
  }
}

/**
 * Updates a course owned by the authenticated instructor.
 *
 * Validates the course ID and submitted fields, verifies the category
 * when it is updated, and applies the changes to the matching course.
 * Resets the course status to draft after an update and handles
 * duplicate slugs and missing courses.
 *
 * @param {Object} req - The request object containing the authenticated instructor, course ID, and update data.
 * @param {Object} res - The response object used to return the updated course or an error response.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated course or the result of error forwarding.
 */
export async function updateInstructorCourse(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  // Validate and normalize the supplied fields for a partial course update.
  const { input, errors } = parseCourseInput(req.body ?? {}, true);

  // Reject invalid input or requests that do not provide any fields to update.
  if (errors.length > 0 || Object.keys(input).length === 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors:
        errors.length > 0
          ? errors
          : [{ field: "body", message: "Provide at least one course field" }],
    });
  }

  try {
    // Verify that the specified category exists when the category field is updated.
    if (
      Object.hasOwn(input, "category") &&
      !(await validateCategory(input.category))
    ) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "category", message: "Category does not exist" }],
      });
    }

    // Update only the instructor's course and reset its status to draft.
    const course = await courseModel.findOneAndUpdate(
      { _id: req.params.courseId, instructor: req.user._id },
      { $set: { ...input, status: "DRAFT" } },
      { new: true, runValidators: true },
    );

    // Return a not-found response if the course does not exist or is not owned by the instructor.
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Return the updated course record.
    return res.json({ course });
  } catch (error) {
    // Return a conflict response when the updated slug violates a unique constraint.
    if (error.code === 11000) {
      return res.status(409).json({ message: "Course slug already exists" });
    }

    // Forward unexpected database and application errors to centralized error-handling middleware.
    return next(error);
  }
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
