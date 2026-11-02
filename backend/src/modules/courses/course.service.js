import mongoose from "mongoose";
import categoryModel from "../categories/category.model.js";
import { slugify } from "../../utils/slugify.js";
import courseModel from "./course.model.js";
import {
  validateCreateCourse,
  validateGetCoursesQuery,
  validateInstructorCoursesQuery,
  validateUpdateCourse,
} from "./course.validation.js";

const INSTRUCTOR_EDITABLE_FIELDS = new Set([
  "title",
  "subtitle",
  "description",
  "category",
  "level",
  "language",
  "tags",
  "courseType",
  "learningObjectives",
  "learningOutcomes",
  "requirements",
  "targetAudience",
  "enrollmentOpen",
  "maxStudents",
  "certificateAvailable",
  "visibility",
]);

const COURSE_RESPONSE_FIELDS = [
  "_id",
  "title",
  "subtitle",
  "description",
  "slug",
  "thumbnail",
  "instructor",
  "category",
  "level",
  "language",
  "tags",
  "courseType",
  "learningObjectives",
  "learningOutcomes",
  "requirements",
  "targetAudience",
  "totalModules",
  "totalLessons",
  "totalDurationMinutes",
  "enrollmentOpen",
  "maxStudents",
  "certificateAvailable",
  "visibility",
  "status",
  "publishedAt",
  "averageRating",
  "totalReviews",
  "totalViews",
  "enrollmentCount",
  "createdAt",
  "updatedAt",
];
const COURSE_SELECT = COURSE_RESPONSE_FIELDS.join(" ");
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CATALOG_SORTS = new Map([
  ["newest", { createdAt: -1, _id: 1 }],
  ["oldest", { createdAt: 1, _id: 1 }],
  ["popular", { enrollmentCount: -1, createdAt: -1, _id: 1 }],
  ["mostPopular", { enrollmentCount: -1, createdAt: -1, _id: 1 }],
  [
    "highestRated",
    { averageRating: -1, totalReviews: -1, createdAt: -1, _id: 1 },
  ],
]);

/**
 * Error raised for expected course-service failures.
 *
 * @param {number} statusCode - The HTTP status code for the controller.
 * @param {string} message - A safe, user-facing error message.
 * @param {Array<object>} [errors] - Optional field-level validation errors.
 */
export class CourseServiceError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.name = "CourseServiceError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

/**
 * Ensures a course identifier is a valid MongoDB ObjectId.
 *
 * @param {*} courseId - The supplied course identifier.
 */
function assertValidCourseId(courseId) {
  if (!mongoose.isValidObjectId(courseId)) {
    throw new CourseServiceError(400, "Course ID is invalid");
  }
}

/**
 * Ensures that an authenticated instructor identifier is present and valid.
 *
 * @param {*} instructorId - The authenticated user's identifier.
 */
function assertValidInstructorId(instructorId) {
  if (!instructorId) {
    throw new CourseServiceError(401, "Authenticated instructor is required");
  }
  if (!mongoose.isValidObjectId(instructorId)) {
    throw new CourseServiceError(400, "Instructor ID is invalid");
  }
}

/**
 * Validates course data through the shared validation layer.
 *
 * @param {*} body - The submitted course data.
 * @param {Function} validator - The create or update course validator.
 * @returns {object} The validated update fields.
 */
function getValidatedCourseUpdates(body, validator) {
  const { updates, errors } = validator(body);

  if (errors.length > 0) {
    throw new CourseServiceError(400, "Validation failed", errors);
  }

  // Keep the service boundary restricted even if another caller bypasses the route.
  for (const field of Object.keys(updates)) {
    if (!INSTRUCTOR_EDITABLE_FIELDS.has(field)) {
      throw new CourseServiceError(400, "Validation failed", [
        { field, message: "This field cannot be updated" },
      ]);
    }
  }

  return updates;
}

/**
 * Confirms that an optional course category exists.
 *
 * @param {string|null|undefined} categoryId - The submitted category ID.
 */
async function assertCategoryExists(categoryId) {
  if (categoryId && !(await categoryModel.exists({ _id: categoryId }))) {
    throw new CourseServiceError(400, "Validation failed", [
      { field: "category", message: "Category does not exist" },
    ]);
  }
}

/**
 * Finds an available slug based on the course title.
 *
 * A numeric suffix is added when a title-derived slug is already in use;
 * the unique database index remains the final guard against concurrent writes.
 *
 * @param {string} title - The course title.
 * @returns {Promise<string>} An available URL-friendly slug.
 */
async function createUniqueSlug(title) {
  const baseSlug = slugify(title);
  if (!baseSlug || !COURSE_SLUG_PATTERN.test(baseSlug)) {
    throw new CourseServiceError(
      400,
      "Course title cannot produce a valid slug",
      [
        {
          field: "title",
          message: "Must contain letters or numbers for a course URL",
        },
      ],
    );
  }

  let slug = baseSlug;
  let suffix = 2;

  while (await courseModel.exists({ slug })) {
    const suffixText = `-${suffix}`;
    slug = `${baseSlug.slice(0, 80 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  return slug;
}

/**
 * Converts a course document to the service's safe response shape.
 *
 * @param {object|null} course - A Mongoose document or lean course object.
 * @returns {object|null} The selected public-facing course fields.
 */
function toSafeCourse(course) {
  if (!course) return null;

  const value =
    typeof course.toObject === "function" ? course.toObject() : course;
  const safeCourse = {};

  for (const field of COURSE_RESPONSE_FIELDS) {
    if (value[field] !== undefined) safeCourse[field] = value[field];
  }

  return safeCourse;
}

/**
 * Validates pagination and creates shared pagination response metadata.
 *
 * @param {number} total - The total number of matching courses.
 * @param {number} page - The one-based current page.
 * @param {number} pageSize - The number of courses per page.
 * @returns {object} Pagination metadata.
 */
function createPagination(total, page, pageSize) {
  const totalPages = Math.ceil(total / pageSize);

  return {
    totalCourses: total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

/**
 * Builds an escaped case-insensitive literal search expression.
 *
 * @param {string} search - The normalized search phrase.
 * @returns {RegExp} A safe regular expression for MongoDB matching.
 */
function createSearchExpression(search) {
  return new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/**
 * Prepares query input for validation, including values returned by the
 * validation module and the catalog sort aliases supported by this service.
 *
 * @param {*} query - Raw or normalized query data.
 * @param {Function} validator - The corresponding query validator.
 * @param {boolean} allowCatalogSortAliases - Whether special catalog sorts apply.
 * @returns {object} Validated, normalized query values.
 */
function getValidatedQuery(query, validator, allowCatalogSortAliases = false) {
  if (
    !query ||
    typeof query !== "object" ||
    Array.isArray(query) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(query))
  ) {
    throw new CourseServiceError(400, "Validation failed", [
      { field: "query", message: "Must be an object" },
    ]);
  }

  const input = { ...query };

  let catalogSort;
  if (allowCatalogSortAliases && typeof input.sortBy === "string") {
    const key = input.sortBy.trim();
    if (CATALOG_SORTS.has(key)) {
      catalogSort = key;
      // The shared validator currently accepts only its established sort fields.
      input.sortBy = "createdAt";
    }
  }

  const result = validator(input);
  if (result.errors.length > 0) {
    throw new CourseServiceError(400, "Validation failed", result.errors);
  }

  if (catalogSort) result.sortBy = catalogSort;
  return result;
}

/**
 * Builds sorting options for course listings.
 *
 * @param {object} query - Validated sort field and direction.
 * @param {boolean} [catalog=false] - Whether catalog sort aliases are enabled.
 * @returns {object} A MongoDB sort specification.
 */
function getSort(query, catalog = false) {
  if (catalog && CATALOG_SORTS.has(query.sortBy)) {
    return CATALOG_SORTS.get(query.sortBy);
  }

  if (catalog && query.sortBy === "createdAt") {
    return { createdAt: query.sortOrder === "asc" ? 1 : -1, _id: 1 };
  }

  return {
    [query.sortBy ?? "createdAt"]: query.sortOrder === "asc" ? 1 : -1,
    _id: 1,
  };
}

/**
 * Creates a course for the authenticated instructor.
 *
 * Pass the instructor ID from the authenticated user (for example,
 * `req.user._id`) and the raw request body; this function validates the body
 * and never accepts ownership or administrative fields from it.
 *
 * @param {string|object} instructorId - The authenticated instructor's ID.
 * @param {object} courseData - Raw instructor-submitted course data.
 * @returns {Promise<object>} The created course in its safe response shape.
 */
export async function createCourse(instructorId, courseData) {
  assertValidInstructorId(instructorId);

  const updates = getValidatedCourseUpdates(courseData, validateCreateCourse);
  await assertCategoryExists(updates.category);
  const slug = await createUniqueSlug(updates.title);

  try {
    const course = await courseModel.create({
      ...updates,
      instructor: instructorId,
      slug,
      status: "DRAFT",
    });

    return toSafeCourse(course);
  } catch (error) {
    if (
      error.code === 11000 &&
      (error.keyPattern?.slug || error.keyValue?.slug)
    ) {
      throw new CourseServiceError(409, "Course slug already exists");
    }
    throw error;
  }
}

/**
 * Updates a course owned by the authenticated instructor.
 *
 * The service accepts only fields permitted by the course validator. It does
 * not accept a slug update; editing a title leaves the existing URL unchanged.
 * Content edits return the course to DRAFT, matching the existing controller's
 * resubmission behavior without allowing direct status changes.
 *
 * @param {string|object} courseId - The course's MongoDB ObjectId.
 * @param {string|object} instructorId - The authenticated instructor's ID.
 * @param {object} updates - Raw partial update data.
 * @returns {Promise<object>} The updated course in its safe response shape.
 */
export async function updateCourse(courseId, instructorId, updates) {
  assertValidCourseId(courseId);
  assertValidInstructorId(instructorId);

  const course = await courseModel
    .findOne({
      _id: courseId,
      instructor: instructorId,
      isDeleted: false,
    })
    .select("_id")
    .lean();

  // Hide courses that do not belong to the caller as not found.
  if (!course) {
    throw new CourseServiceError(404, "Course not found");
  }

  const validatedUpdates = getValidatedCourseUpdates(
    updates,
    validateUpdateCourse,
  );
  await assertCategoryExists(validatedUpdates.category);

  const updatedCourse = await courseModel
    .findOneAndUpdate(
      { _id: courseId, instructor: instructorId, isDeleted: false },
      { $set: { ...validatedUpdates, status: "DRAFT" } },
      { new: true, runValidators: true },
    )
    .select(COURSE_SELECT)
    .populate("category", "name slug")
    .populate("instructor", "firstName lastName username")
    .lean();

  if (!updatedCourse) {
    throw new CourseServiceError(404, "Course not found");
  }

  return toSafeCourse(updatedCourse);
}

/**
 * Determines whether the viewer may see a course outside public discovery.
 *
 * Published PUBLIC and UNLISTED courses are accessible by their direct URL.
 * Other course states and PRIVATE courses are limited to their instructor
 * and administrators.
 *
 * @param {object} course - The course being accessed.
 * @param {object|string|null} viewer - The authenticated viewer, if any.
 * @returns {boolean} True if the viewer may access the course.
 */
function canViewCourse(course, viewer) {
  const viewerId =
    typeof viewer === "string" || viewer instanceof mongoose.Types.ObjectId
      ? viewer
      : (viewer?._id ?? viewer?.id);
  const role = typeof viewer === "object" ? viewer?.role : undefined;
  const instructorId = course.instructor?._id ?? course.instructor;
  const isOwner =
    viewerId !== undefined && String(instructorId) === String(viewerId);
  const isAdministrator = role === "ADMIN";

  if (isOwner || isAdministrator) return true;

  return (
    course.status === "PUBLISHED" &&
    (course.visibility === "PUBLIC" || course.visibility === "UNLISTED")
  );
}

/**
 * Retrieves a course by MongoDB ObjectId, applying visibility and ownership
 * rules before returning its safe response shape.
 *
 * @param {string|object} courseId - The course's MongoDB ObjectId.
 * @param {object|string|null} [viewer=null] - The authenticated viewer or null.
 * @returns {Promise<object>} The accessible course.
 */
export async function getCourseById(courseId, viewer = null) {
  assertValidCourseId(courseId);

  const course = await courseModel
    .findOne({ _id: courseId, isDeleted: false })
    .select(COURSE_SELECT)
    .populate("category", "name slug")
    .populate("instructor", "firstName lastName username")
    .lean();

  if (!course || !canViewCourse(course, viewer)) {
    throw new CourseServiceError(404, "Course not found");
  }

  return toSafeCourse(course);
}

/**
 * Retrieves a course by slug using the same access rules as ID retrieval.
 *
 * @param {string} slug - The course's URL slug.
 * @param {object|string|null} [viewer=null] - The authenticated viewer or null.
 * @returns {Promise<object>} The accessible course.
 */
export async function getCourseBySlug(slug, viewer = null) {
  if (
    typeof slug !== "string" ||
    slug.length > 80 ||
    !COURSE_SLUG_PATTERN.test(slug)
  ) {
    throw new CourseServiceError(400, "Course slug is invalid");
  }

  const course = await courseModel
    .findOne({ slug, isDeleted: false })
    .select(COURSE_SELECT)
    .populate("category", "name slug")
    .populate("instructor", "firstName lastName username")
    .lean();

  if (!course || !canViewCourse(course, viewer)) {
    throw new CourseServiceError(404, "Course not found");
  }

  return toSafeCourse(course);
}

/**
 * Retrieves the public catalog of published, publicly visible courses.
 *
 * Search terms are treated literally and matched against title, description,
 * tags, and search keywords. Enrollment availability does not affect discovery.
 *
 * @param {object} query - Raw catalog query parameters; the service normalizes them.
 * @returns {Promise<{courses: Array<object>, pagination: object}>} Courses and pagination metadata.
 */
export async function getAllCourses(query = {}) {
  const filters = getValidatedQuery(query, validateGetCoursesQuery, true);
  const filter = {
    status: "PUBLISHED",
    visibility: "PUBLIC",
    isDeleted: false,
  };

  if (filters.category) {
    filter.category = filters.category === "none" ? null : filters.category;
  }
  if (filters.level) filter.level = filters.level;
  if (filters.courseType) filter.courseType = filters.courseType;
  if (filters.language) {
    filter.language = new RegExp(
      `^${filters.language.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    );
  }
  if (filters.minRating !== undefined) {
    filter.averageRating = { $gte: filters.minRating };
  }
  if (filters.search) {
    const expression = createSearchExpression(filters.search);
    filter.$or = [
      { title: expression },
      { description: expression },
      { tags: expression },
      { searchKeywords: expression },
    ];
  }

  const page = filters.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const [courses, total] = await Promise.all([
    courseModel
      .find(filter)
      .select(COURSE_SELECT)
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username")
      .sort(getSort(filters, true))
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    courseModel.countDocuments(filter),
  ]);

  return {
    courses: courses.map(toSafeCourse),
    pagination: createPagination(total, page, pageSize),
  };
}

/**
 * Retrieves non-deleted courses belonging to an instructor.
 *
 * @param {string|object} instructorId - The authenticated instructor's ID.
 * @param {object} query - Raw instructor-list query parameters; the service normalizes them.
 * @returns {Promise<{courses: Array<object>, pagination: object}>} Courses and pagination metadata.
 */
export async function getInstructorCourses(instructorId, query = {}) {
  assertValidInstructorId(instructorId);

  const filters = getValidatedQuery(query, validateInstructorCoursesQuery);
  const filter = {
    instructor: instructorId,
    isDeleted: false,
  };

  if (filters.status) filter.status = filters.status;
  if (filters.search) {
    filter.title = createSearchExpression(filters.search);
  }

  const page = filters.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const [courses, total] = await Promise.all([
    courseModel
      .find(filter)
      .select(COURSE_SELECT)
      .populate("category", "name slug")
      .sort(getSort(filters))
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    courseModel.countDocuments(filter),
  ]);

  return {
    courses: courses.map(toSafeCourse),
    pagination: createPagination(total, page, pageSize),
  };
}
