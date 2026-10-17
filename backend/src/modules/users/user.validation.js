import mongoose from "mongoose";
import { ACCOUNT_STATUSES, USER_ROLES } from "./user.model.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;
const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "username",
  "email",
  "phone",
  "headline",
  "currentPosition",
  "bio",
  "location",
  "website",
  "socialLinks",
  "skills",
  "coverPhoto",
];
const STRING_LIMITS = {
  firstName: 80,
  lastName: 80,
  username: 30,
  email: 254,
  phone: 30,
  headline: 120,
  currentPosition: 100,
  bio: 2000,
  website: 300,
  coverPhoto: 500,
};

/**
 * Validates and normalizes profile update data.
 *
 * Only explicitly permitted profile fields are accepted. Valid values are
 * normalized and returned as partial updates, while validation errors are
 * collected for the caller to handle.
 *
 * @param {object} body - Profile update data from the request body.
 * @returns {{ updates: object, errors: Array<{ field: string, message: string }> }}
 *          Validated update fields and any validation errors.
 */
export function validateProfile(body) {
  const updates = {};
  const errors = [];

  // Ensure the request body is a plain object before processing updates.
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    return {
      updates,
      errors: [{ field: "body", message: "Must be an object" }],
    };
  }

  // Require at least one field to prevent empty profile update requests.
  if (Object.keys(body).length === 0) {
    return {
      updates,
      errors: [
        { field: "body", message: "Provide at least one profile field" },
      ],
    };
  }

  // Reject unsupported fields to prevent unintended property updates.
  for (const field of Object.keys(body)) {
    if (!PROFILE_FIELDS.includes(field)) {
      errors.push({ field, message: "This field cannot be updated" });
    }
  }

  // Validate, trim, and normalize supported string fields.
  for (const [field, maxLength] of Object.entries(STRING_LIMITS)) {
    if (body[field] === undefined) continue;

    const value = body[field];

    // Enforce string types, maximum lengths, and non-empty required values.
    if (
      typeof value !== "string" ||
      value.trim().length > maxLength ||
      (["firstName", "lastName", "username", "email"].includes(field) &&
        value.trim().length === 0)
    ) {
      errors.push({
        field,
        message: `Must be a valid string of at most ${maxLength} characters`,
      });
      continue;
    }

    const normalized = value.trim();

    // Enforce the username's minimum length and permitted characters.
    if (
      field === "username" &&
      (normalized.length < 3 || !USERNAME_PATTERN.test(normalized))
    ) {
      errors.push({
        field,
        message: "Must be 3-30 letters, numbers, or underscores",
      });
      continue;
    }

    // Reject email addresses that do not match the expected format.
    if (field === "email" && !EMAIL_PATTERN.test(normalized)) {
      errors.push({ field, message: "Must be a valid email address" });
      continue;
    }

    // Validate the phone number format when a non-empty value is supplied.
    if (
      field === "phone" &&
      normalized !== "" &&
      !/^\+?[0-9().\-\s]{7,30}$/.test(normalized)
    ) {
      errors.push({ field, message: "Must be a valid phone number" });
      continue;
    }

    // Normalize identifiers consistently for storage and comparison.
    updates[field] =
      field === "email" || field === "username"
        ? normalized.toLowerCase()
        : normalized;
  }

  // Validate nested objects using explicit allowlists for each object type.
  for (const [field, acceptedFields, maxLength] of [
    ["location", ["country", "city"], 80],
    ["socialLinks", ["linkedin", "github", "twitter", "youtube"], 300],
  ]) {
    if (body[field] === undefined) continue;

    const value = body[field];

    // Require a plain object rather than an array or another object type.
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      errors.push({ field, message: "Must be an object" });
      continue;
    }

    for (const [nestedField, nestedValue] of Object.entries(value)) {
      // Prevent clients from modifying unapproved nested properties.
      if (!acceptedFields.includes(nestedField)) {
        errors.push({
          field: `${field}.${nestedField}`,
          message: "This field cannot be updated",
        });
      } else if (
        // Enforce the nested property's type and maximum length.
        typeof nestedValue !== "string" ||
        nestedValue.trim().length > maxLength
      ) {
        errors.push({
          field: `${field}.${nestedField}`,
          message: `Must be a string of at most ${maxLength} characters`,
        });
      } else {
        // Use dot notation so partial updates preserve other nested properties.
        updates[`${field}.${nestedField}`] = nestedValue.trim();
      }
    }
  }

  // Validate the skills collection and enforce item-count and length limits.
  if (body.skills !== undefined) {
    if (
      !Array.isArray(body.skills) ||
      body.skills.length > 50 ||
      body.skills.some(
        (skill) =>
          typeof skill !== "string" ||
          skill.trim().length === 0 ||
          skill.trim().length > 60,
      )
    ) {
      errors.push({
        field: "skills",
        message:
          "Must be an array of at most 50 non-empty strings, each at most 60 characters",
      });
    } else {
      // Trim each skill before adding it to the validated update payload.
      updates.skills = body.skills.map((skill) => skill.trim());
    }
  }

  // Reject requests that contain no valid updates when no errors were found.
  if (errors.length === 0 && Object.keys(updates).length === 0) {
    errors.push({
      field: "body",
      message: "Provide at least one supported field",
    });
  }

  return { updates, errors };
}

/**
 * Validates and prepares user updates submitted by an administrator.
 *
 * Separates profile fields from administrative account fields, delegates
 * profile validation to validateProfile(), and validates role and account
 * status changes. Ensures that status and isActive remain consistent.
 *
 * @param {Object} body - The request body containing the proposed user updates.
 * @returns {{ updates: Object, errors: Array<Object> }} Validated update fields and validation errors.
 */
export function validateAdminUserUpdate(body) {
  // Separate administrative fields from profile fields.
  const profileBody = Object.fromEntries(
    Object.entries(body).filter(
      ([field]) =>
        field !== "role" && field !== "status" && field !== "isActive",
    ),
  );

  // Validate profile fields only when at least one has been provided.
  const profileResult =
    Object.keys(profileBody).length > 0
      ? validateProfile(profileBody)
      : { updates: {}, errors: [] };

  // Collect validated profile updates and any associated errors.
  const { updates, errors } = profileResult;

  // Validate the requested role against the supported user roles.
  if (body.role !== undefined) {
    if (!USER_ROLES.includes(body.role)) {
      errors.push({
        field: "role",
        message: `Must be one of: ${USER_ROLES.join(", ")}`,
      });
    } else {
      updates.role = body.role;
    }
  }

  // Validate the account status and synchronize the active flag.
  if (body.status !== undefined) {
    if (!ACCOUNT_STATUSES.includes(body.status)) {
      errors.push({
        field: "status",
        message: `Must be one of: ${ACCOUNT_STATUSES.join(", ")}`,
      });
    } else {
      updates.status = body.status;
      updates.isActive = body.status === "ACTIVE";
    }
  }

  // Validate a direct active-state update when status is not provided.
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      errors.push({ field: "isActive", message: "Must be a boolean" });
    } else if (body.status === undefined) {
      updates.isActive = body.isActive;
      updates.status = body.isActive ? "ACTIVE" : "INACTIVE";
    } else {
      // Prevent conflicting account-state instructions in the same request.
      errors.push({
        field: "status",
        message: "Provide status or isActive, not both",
      });
    }
  }

  // Return the validated updates alongside all collected validation errors.
  return { updates, errors };
}

/**
 * Validates the user ID provided in the request parameters.
 *
 * Ensures that the userId parameter is a valid MongoDB ObjectId before
 * allowing the request to proceed to the route handler.
 *
 * @param {Object} req - The request object containing route parameters.
 * @param {Object} res - The response object used to return validation errors.
 * @param {Function} next - The middleware function for continuing the request.
 * @returns {Object|void} A validation error response or the result of next().
 */
export function validateUserIdParam(req, res, next) {
  // Reject requests containing an invalid MongoDB ObjectId.
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: "User ID is invalid" });
  }

  // Continue when the user ID passes validation.
  return next();
}
