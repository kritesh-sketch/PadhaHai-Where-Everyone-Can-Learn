import mongoose from "mongoose";
import { ENROLLMENT_STATUSES } from "./enrollment.model.js";

/**
 * Validates whether a course ID is a valid MongoDB ObjectId.
 *
 * @param {string|Object} courseId - The course identifier to validate.
 * @returns {boolean} True if the identifier is valid; otherwise, false.
 */
export function validateCourseId(courseId) {
  // Check whether the supplied value is a valid MongoDB ObjectId.
  return mongoose.isValidObjectId(courseId);
}

/**
 * Validates whether an enrollment ID is a valid MongoDB ObjectId.
 *
 * @param {string|Object} enrollmentId - The enrollment identifier to validate.
 * @returns {boolean} True if the identifier is valid; otherwise, false.
 */
export function validateEnrollmentId(enrollmentId) {
  // Check whether the supplied value is a valid MongoDB ObjectId.
  return mongoose.isValidObjectId(enrollmentId);
}

/**
 * Validates whether a lesson ID is a valid MongoDB ObjectId.
 *
 * @param {string|Object} lessonId - The lesson identifier to validate.
 * @returns {boolean} True if the identifier is valid; otherwise, false.
 */
export function validateLessonId(lessonId) {
  // Check whether the supplied value is a valid MongoDB ObjectId.
  return mongoose.isValidObjectId(lessonId);
}

/**
 * Checks whether the enrollment request body is an empty object.
 *
 * Useful for endpoints that do not accept additional request fields
 * and require the request body to contain no properties.
 *
 * @param {Object} body - The request body to validate.
 * @returns {boolean} True if the body is a non-null, non-array empty object.
 */
export function validateEmptyEnrollmentBody(body = {}) {
  // Accept only non-null objects that are not arrays and contain no properties.
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === 0
  );
}

/**
 * Parses and validates enrollment listing query parameters.
 *
 * Validates pagination values and the optional enrollment status filter,
 * returning normalized values alongside any validation errors.
 *
 * @param {Object} query - The query parameters supplied with the request.
 * @returns {{page: number, limit: number, status: string|undefined, errors: Array<Object>}}
 * The parsed pagination values, optional status, and validation errors.
 */
export function parseEnrollmentListQuery(query = {}) {
  // Apply default pagination values when parameters are not provided.
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);
  const status = query.status;
  const errors = [];

  // Require the page number to be a positive integer.
  if (!Number.isInteger(page) || page < 1) {
    errors.push({ field: "page", message: "Must be a positive integer" });
  }

  // Restrict the page size to between 1 and 100 records.
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.push({
      field: "limit",
      message: "Must be an integer from 1 to 100",
    });
  }

  // Ensure the optional status filter matches a supported enrollment status.
  if (status !== undefined && !ENROLLMENT_STATUSES.includes(status)) {
    errors.push({
      field: "status",
      message: `Must be one of: ${ENROLLMENT_STATUSES.join(", ")}`,
    });
  }

  // Return the parsed values and all validation errors for the caller to handle.
  return { page, limit, status, errors };
}

/**
 * Parses and validates enrollment status changes requested by an administrator.
 *
 * Allows administrators to activate or suspend an enrollment while rejecting
 * unsupported status values and additional request fields.
 *
 * @param {Object} body - The request body containing the requested status.
 * @returns {{status: string|undefined, errors: Array<Object>}}
 * The requested status and any validation errors.
 */
export function parseAdministrativeStatusInput(body = {}) {
  // Restrict administrative status updates to the status field.
  const allowedFields = ["status"];
  const errors = [];

  // Reject unexpected fields and statuses that administrators cannot assign.
  if (
    Object.keys(body).some((field) => !allowedFields.includes(field)) ||
    !["ACTIVE", "SUSPENDED"].includes(body.status)
  ) {
    errors.push({
      field: "status",
      message: "Only ACTIVE or SUSPENDED may be set by an administrator",
    });
  }

  // Return the requested status and validation errors for the controller.
  return { status: body.status, errors };
}
