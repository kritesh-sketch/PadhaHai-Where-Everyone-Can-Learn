import mongoose from "mongoose";
import {
  COURSE_STATUSES,
  COURSE_LEVELS,
  COURSE_TYPES,
  COURSE_VISIBILITIES,
} from "./course.constants.js";

const INSTRUCTOR_EDITABLE_FIELDS = [
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
];
const COURSE_STRING_LIMITS = {
  title: { minimum: 3, maximum: 160 },
  subtitle: { minimum: 0, maximum: 250 },
  description: { minimum: 10, maximum: 10000 },
  language: { minimum: 1, maximum: 60 },
};
const COURSE_ARRAY_LIMITS = {
  tags: { maximumItems: 50, maximumLength: 60 },
  learningObjectives: { maximumItems: 30, maximumLength: 500 },
  learningOutcomes: { maximumItems: 30, maximumLength: 500 },
  requirements: { maximumItems: 30, maximumLength: 500 },
  targetAudience: { maximumItems: 30, maximumLength: 500 },
};
const COURSE_SORT_FIELDS = ["createdAt", "updatedAt", "title"];
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Checks whether a value is a plain object suitable for request data.
 *
 * @param {*} value - The value to check.
 * @returns {boolean} True when the value is a plain object.
 */
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validates instructor-editable course data and returns normalized updates.
 *
 * @param {*} body - The submitted course data.
 * @param {boolean} partial - Whether required creation fields may be omitted.
 * @returns {{ updates: object, errors: Array<{ field: string, message: string }> }}
 *          Validated updates and field-specific validation errors.
 */
function validateCourseInput(body, partial) {
  const updates = {};
  const errors = [];

  if (!isPlainObject(body)) {
    return {
      updates,
      errors: [{ field: "body", message: "Must be an object" }],
    };
  }

  for (const field of Object.keys(body)) {
    if (!INSTRUCTOR_EDITABLE_FIELDS.includes(field)) {
      errors.push({ field, message: "This field cannot be updated" });
    }
  }

  if (
    partial &&
    !Object.keys(body).some((field) =>
      INSTRUCTOR_EDITABLE_FIELDS.includes(field),
    )
  ) {
    errors.push({
      field: "body",
      message: "Provide at least one course field",
    });
  }

  for (const [field, { minimum, maximum }] of Object.entries(
    COURSE_STRING_LIMITS,
  )) {
    const required = !partial && ["title", "description"].includes(field);

    if (body[field] === undefined) {
      if (required) {
        errors.push({ field, message: "This field is required" });
      }
      continue;
    }

    if (typeof body[field] !== "string") {
      errors.push({
        field,
        message: `Must be a string of at most ${maximum} characters`,
      });
      continue;
    }

    const value = body[field].trim();
    if (value.length < minimum || value.length > maximum) {
      errors.push({
        field,
        message:
          minimum === 0
            ? `Must be a string of at most ${maximum} characters`
            : `Must be between ${minimum} and ${maximum} characters`,
      });
      continue;
    }

    updates[field] = value;
  }

  if (body.category !== undefined) {
    const category =
      typeof body.category === "string" ? body.category.trim() : body.category;

    if (category === null || category === "") {
      updates.category = null;
    } else if (
      typeof category === "string" &&
      mongoose.isValidObjectId(category)
    ) {
      updates.category = category;
    } else {
      errors.push({
        field: "category",
        message: "Must be a valid category ID or null",
      });
    }
  }

  for (const [field, allowedValues] of [
    ["level", COURSE_LEVELS],
    ["courseType", COURSE_TYPES],
    ["visibility", COURSE_VISIBILITIES],
  ]) {
    if (body[field] === undefined) continue;

    const value =
      typeof body[field] === "string"
        ? body[field].trim().toUpperCase()
        : body[field];
    if (typeof value !== "string" || !allowedValues.includes(value)) {
      errors.push({
        field,
        message: `Must be one of: ${allowedValues.join(", ")}`,
      });
    } else {
      updates[field] = value;
    }
  }

  for (const [field, { maximumItems, maximumLength }] of Object.entries(
    COURSE_ARRAY_LIMITS,
  )) {
    if (body[field] === undefined) continue;

    if (
      !Array.isArray(body[field]) ||
      body[field].length > maximumItems ||
      body[field].some(
        (item) =>
          typeof item !== "string" ||
          item.trim().length === 0 ||
          item.trim().length > maximumLength,
      )
    ) {
      errors.push({
        field,
        message: `Must be an array of at most ${maximumItems} non-empty strings, each at most ${maximumLength} characters`,
      });
    } else {
      updates[field] = body[field].map((item) => item.trim());
    }
  }

  for (const field of ["enrollmentOpen", "certificateAvailable"]) {
    if (body[field] === undefined) continue;

    if (typeof body[field] !== "boolean") {
      errors.push({ field, message: "Must be a boolean" });
    } else {
      updates[field] = body[field];
    }
  }

  if (body.maxStudents !== undefined) {
    if (
      body.maxStudents !== null &&
      (!Number.isSafeInteger(body.maxStudents) ||
        body.maxStudents < 1 ||
        body.maxStudents > 1000000)
    ) {
      errors.push({
        field: "maxStudents",
        message: "Must be null or an integer from 1 to 1000000",
      });
    } else {
      updates.maxStudents = body.maxStudents;
    }
  }

  return { updates, errors };
}

/**
 * Validates and normalizes data for creating a course.
 *
 * Only instructor-editable fields are accepted. Title and description are
 * required, while all other supported fields are optional.
 *
 * @param {*} body - The request body containing course data.
 * @returns {{ updates: object, errors: Array<{ field: string, message: string }> }}
 *          Validated updates and any validation errors.
 */
export function validateCreateCourse(body) {
  return validateCourseInput(body, false);
}

/**
 * Validates and normalizes a partial course update.
 *
 * Only instructor-editable fields are accepted, and at least one supported
 * field must be provided. Title and description are not required.
 *
 * @param {*} body - The request body containing course updates.
 * @returns {{ updates: object, errors: Array<{ field: string, message: string }> }}
 *          Validated updates and any validation errors.
 */
export function validateUpdateCourse(body) {
  return validateCourseInput(body, true);
}

/**
 * Validates the course ID provided in the request parameters.
 *
 * @param {object} req - The request object containing route parameters.
 * @param {object} res - The response object used to return validation errors.
 * @param {Function} next - The middleware function for continuing the request.
 * @returns {*} A validation error response or the result of next().
 */
export function validateCourseIdParam(req, res, next) {
  if (!mongoose.isValidObjectId(req.params?.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  return next();
}

/**
 * Validates the course slug provided in the request parameters.
 *
 * @param {object} req - The request object containing route parameters.
 * @param {object} res - The response object used to return validation errors.
 * @param {Function} next - The middleware function for continuing the request.
 * @returns {*} A validation error response or the result of next().
 */
export function validateCourseSlugParam(req, res, next) {
  const slug = req.params?.slug;

  if (
    typeof slug !== "string" ||
    slug.length > 180 ||
    !COURSE_SLUG_PATTERN.test(slug)
  ) {
    return res.status(400).json({ message: "Course slug is invalid" });
  }

  return next();
}

/**
 * Parses a query parameter as a finite number without accepting coercive
 * values such as arrays, empty strings, or hexadecimal notation.
 *
 * @param {*} value - The supplied query parameter.
 * @param {boolean} integer - Whether the value must be an integer.
 * @returns {number|undefined} The parsed number, or undefined when invalid.
 */
function parseQueryNumber(value, integer = false) {
  if (typeof value === "number") {
    return Number.isFinite(value) && (!integer || Number.isInteger(value))
      ? value
      : undefined;
  }

  if (
    typeof value !== "string" ||
    !(integer ? /^\d+$/.test(value) : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
  ) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && (!integer || Number.isInteger(parsed))
    ? parsed
    : undefined;
}

/**
 * Validates shared course-list query parameters and returns normalized values.
 *
 * @param {*} query - The query parameters supplied with the request.
 * @param {string[]} allowedFields - Fields permitted by the endpoint.
 * @param {object} [options] - Endpoint-specific query settings.
 * @param {string[]} [options.statuses] - Supported course status values.
 * @param {boolean} [options.learner] - Whether learner filters are enabled.
 * @returns {object} Normalized filters, sorting and pagination values, and errors.
 */
function validateCourseListQuery(
  query,
  allowedFields,
  { statuses, learner = false } = {},
) {
  const errors = [];
  const values = {
    search: "",
    sortBy: "createdAt",
    sortOrder: "desc",
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  };

  if (!isPlainObject(query)) {
    return {
      ...values,
      errors: [{ field: "query", message: "Must be an object" }],
    };
  }

  for (const field of Object.keys(query)) {
    if (!allowedFields.includes(field)) {
      errors.push({ field, message: "This query parameter is not supported" });
    }
  }

  if (query.search !== undefined && query.q !== undefined) {
    errors.push({
      field: "search",
      message: "Provide search or q, not both",
    });
  }

  const rawSearch = query.search ?? query.q;
  if (rawSearch !== undefined) {
    if (typeof rawSearch !== "string" || rawSearch.trim().length > 100) {
      errors.push({
        field: "search",
        message: "Must be a string of at most 100 characters",
      });
    } else {
      values.search = rawSearch.trim();
    }
  }

  for (const field of ["sortBy", "sortOrder"]) {
    if (query[field] === undefined) continue;

    const supportedValues =
      field === "sortBy" ? Object.values(COURSE_SORT_OPTIONS) : ["asc", "desc"];

    const value =
      typeof query[field] === "string"
        ? field === "sortOrder"
          ? query[field].trim().toLowerCase()
          : query[field].trim()
        : query[field];
    if (typeof value !== "string" || !supportedValues.includes(value)) {
      errors.push({
        field,
        message: `Must be one of: ${supportedValues.join(", ")}`,
      });
    } else {
      values[field] = value;
    }
  }

  for (const [field, defaultValue, maximum] of [
    ["page", DEFAULT_PAGE, Number.MAX_SAFE_INTEGER],
    ["limit", DEFAULT_LIMIT, MAX_PAGE_SIZE],
  ]) {
    if (query[field] === undefined) {
      values[field] = defaultValue;
      continue;
    }

    const parsed = parseQueryNumber(query[field], true);
    if (parsed === undefined || parsed < 1 || parsed > maximum) {
      errors.push({
        field,
        message:
          field === "limit"
            ? `Must be an integer from 1 to ${MAX_PAGE_SIZE}`
            : "Must be a positive integer",
      });
    } else {
      values[field] = parsed;
    }
  }

  if (statuses && query.status !== undefined) {
    const status =
      typeof query.status === "string"
        ? query.status.trim().toUpperCase()
        : query.status;
    if (typeof status !== "string" || !statuses.includes(status)) {
      errors.push({
        field: "status",
        message: `Must be one of: ${statuses.join(", ")}`,
      });
    } else {
      values.status = status;
    }
  }

  if (learner) {
    if (query.category !== undefined) {
      const category =
        typeof query.category === "string"
          ? query.category.trim()
          : query.category;
      if (
        typeof category !== "string" ||
        (category.toLowerCase() !== "none" &&
          !mongoose.isValidObjectId(category))
      ) {
        errors.push({
          field: "category",
          message: "Must be a valid category ID or none",
        });
      } else {
        values.category = category.toLowerCase() === "none" ? "none" : category;
      }
    }

    for (const [field, allowedValues] of [
      ["level", COURSE_LEVELS],
      ["courseType", COURSE_TYPES],
    ]) {
      if (query[field] === undefined) continue;

      const value =
        typeof query[field] === "string"
          ? query[field].trim().toUpperCase()
          : query[field];
      if (typeof value !== "string" || !allowedValues.includes(value)) {
        errors.push({
          field,
          message: `Must be one of: ${allowedValues.join(", ")}`,
        });
      } else {
        values[field] = value;
      }
    }

    if (query.language !== undefined) {
      if (
        typeof query.language !== "string" ||
        query.language.trim().length > 60
      ) {
        errors.push({
          field: "language",
          message: "Must be a string of at most 60 characters",
        });
      } else {
        values.language = query.language.trim();
      }
    }

    if (query.minRating !== undefined) {
      const minRating = parseQueryNumber(query.minRating);
      if (minRating === undefined || minRating < 0 || minRating > 5) {
        errors.push({
          field: "minRating",
          message: "Must be a number from 0 to 5",
        });
      } else {
        values.minRating = minRating;
      }
    }
  }

  return { ...values, errors };
}

/**
 * Validates filters for the learner-facing course catalog.
 *
 * @param {*} query - The query parameters supplied with the request.
 * @returns {object} Normalized search filters, sorting, pagination, and errors.
 */
export function validateGetCoursesQuery(query) {
  return validateCourseListQuery(
    query,
    [
      "search",
      "q",
      "category",
      "level",
      "courseType",
      "language",
      "minRating",
      "sortBy",
      "sortOrder",
      "page",
      "limit",
    ],
    { learner: true },
  );
}
/**
 * Validates filters for an instructor's course listing.
 *
 * @param {*} query - The query parameters supplied with the request.
 * @returns {object} Normalized status, search, sorting, pagination, and errors.
 */
export function validateInstructorCoursesQuery(query) {
  return validateCourseListQuery(
    query,
    ["status", "search", "q", "sortBy", "sortOrder", "page", "limit"],
    { statuses: COURSE_STATUSES },
  );
}
