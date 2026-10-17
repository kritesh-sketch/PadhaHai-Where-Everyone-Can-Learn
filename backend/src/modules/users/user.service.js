import mongoose from "mongoose";
import {
  hashPassword,
  verifyPassword,
} from "../../common/utils/password.util.js";
import sessionModel from "../auth/session.model.js";
import userModel, {
  EDUCATION_LEVELS,
  GENDER_OPTIONS,
  THEME_OPTIONS,
  USER_ROLES,
} from "./user.model.js";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BYTES = 72;

// Defines the shared profile fields that learners and instructors are permitted to update.
const COMMON_PROFILE_FIELDS = new Set([
  "firstName",
  "lastName",
  "phone",
  "dateOfBirth",
  "gender",
  "profilePicture",
  "coverPhoto",
  "headline",
  "bio",
  "location",
  "website",
  "socialLinks",
  "preferredLanguage",
  "theme",
  "notificationPreferences",
]);

// Defines the additional profile fields that learners are permitted to update.
const LEARNER_PROFILE_FIELDS = new Set([
  "educationLevel",
  "institutionName",
  "fieldOfStudy",
  "learningGoals",
  "interests",
]);

// Defines the additional profile fields that instructors are permitted to update.
const INSTRUCTOR_PROFILE_FIELDS = new Set([
  "currentPosition",
  "skills",
  "qualifications",
  "specializations",
  "yearsOfExperience",
]);

// Defines the profile fields included in API responses to ensure consistent and controlled exposure of user information.
const PROFILE_RESPONSE_FIELDS = [
  "_id",
  "firstName",
  "lastName",
  "username",
  "email",
  "phone",
  "role",
  "status",
  "isActive",
  "dateOfBirth",
  "gender",
  "profilePicture",
  "coverPhoto",
  "headline",
  "bio",
  "location",
  "website",
  "socialLinks",
  "preferredLanguage",
  "theme",
  "notificationPreferences",
  "educationLevel",
  "institutionName",
  "fieldOfStudy",
  "learningGoals",
  "interests",
  "currentPosition",
  "skills",
  "qualifications",
  "specializations",
  "yearsOfExperience",
  "instructorStatus",
  "createdAt",
  "updatedAt",
];

// Sets maximum character limits for profile string fields.
const STRING_LIMITS = {
  firstName: 80,
  lastName: 80,
  phone: 30,
  profilePicture: 500,
  coverPhoto: 500,
  headline: 120,
  bio: 2000,
  website: 300,
  institutionName: 150,
  fieldOfStudy: 150,
  currentPosition: 100,
  preferredLanguage: 35,
};

// Defines validation rules for nested profile fields and notification preferences.
const NESTED_PROFILE_FIELDS = {
  location: { country: 80, city: 80 },
  socialLinks: {
    linkedin: 300,
    github: 300,
    twitter: 300,
    youtube: 300,
  },
  notificationPreferences: {
    email: "boolean",
    courseUpdates: "boolean",
    announcements: "boolean",
    learningReminders: "boolean",
  },
};

// Sets maximum item counts and string lengths for profile array fields.
const ARRAY_LIMITS = {
  learningGoals: { count: 30, length: 200 },
  interests: { count: 50, length: 80 },
  skills: { count: 50, length: 60 },
  qualifications: { count: 30, length: 200 },
  specializations: { count: 30, length: 100 },
};

// Defines a custom service error with an HTTP status code and optional validation details.
export class UserServiceError extends Error {
  constructor(statusCode, message, errors) {
    super(message);
    this.name = "UserServiceError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

// Validates the user ID and throws an error if it is not a valid MongoDB ObjectId.
function assertValidUserId(userId) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new UserServiceError(400, "User ID is invalid");
  }
}

// Returns the profile fields editable by the specified user role.
function getProfileFieldsForRole(role) {
  // Ensure the provided role is valid before proceeding with the operation.
  if (!USER_ROLES.includes(role)) {
    throw new UserServiceError(403, "User role is missing or invalid");
  }

  // Create a Set containing the common profile fields to ensure each field is stored only once.
  const fields = new Set(COMMON_PROFILE_FIELDS);

  // Add role-specific profile fields to the allowed fields set based on the user's role.
  if (role === "LEARNER") {
    for (const field of LEARNER_PROFILE_FIELDS) fields.add(field);
  } else if (role === "INSTRUCTOR") {
    for (const field of INSTRUCTOR_PROFILE_FIELDS) fields.add(field);
  }

  // return accirdung to the feild
  return fields;
}

// Returns only whitelisted profile fields appropriate to the user's role.
function safeUser(user) {
  const result = {};
  const fields = new Set(PROFILE_RESPONSE_FIELDS);
  if (user.role !== "LEARNER") {
    for (const field of LEARNER_PROFILE_FIELDS) fields.delete(field);
  }
  if (user.role !== "INSTRUCTOR") {
    for (const field of INSTRUCTOR_PROFILE_FIELDS) fields.delete(field);
    fields.delete("instructorStatus");
  }
  for (const field of fields) {
    if (user[field] !== undefined) result[field] = user[field];
  }
  return result;
}

// Validate that the provided value is a plain object; otherwise, throw a validation error.
function assertPlainObject(value, field) {
  // Ensure the value is a non-null plain object and reject arrays or objects with an unexpected prototype.
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
  // Reject the input if it is not a valid object and return a field-specific validation error.
  {
    throw new UserServiceError(400, "Validation failed", [
      { field, message: "Must be an object" },
    ]);
  }
}

// Trims and validates string inputs against required and maximum-length constraints.
function normalizedString(value, field, maxLength, required = false) {
  // Validate that the provided value is a string; otherwise, throw a validation error.
  if (typeof value !== "string") {
    throw new UserServiceError(400, "Validation failed", [
      { field, message: "Must be a string" },
    ]);
  }

  const normalized = value.trim();

  // Enforce the maximum string length and ensure required fields are not empty.
  if (normalized.length > maxLength || (required && normalized.length === 0)) {
    throw new UserServiceError(400, "Validation failed", [
      {
        field,
        message: required
          ? `Must be a non-empty string of at most ${maxLength} characters`
          : `Must be a string of at most ${maxLength} characters`,
      },
    ]);
  }
  return normalized;
}

// Validates, trims, and deduplicates learner interests.
function normalizeInterests(interests) {
  // Validate that interests is an array within the allowed count and string-length limits.
  if (
    !Array.isArray(interests) ||
    interests.length > ARRAY_LIMITS.interests.count ||
    interests.some(
      (interest) =>
        typeof interest !== "string" ||
        interest.trim().length === 0 ||
        interest.trim().length > ARRAY_LIMITS.interests.length,
    )
  ) {
    throw new UserServiceError(400, "Validation failed", [
      {
        field: "interests",
        message:
          "Must be an array of at most 50 non-empty strings, each at most 80 characters",
      },
    ]);
  }

  const unique = new Map();

  // Normalize interests and remove duplicates using case-insensitive comparison.
  for (const interest of interests) {
    const normalized = interest.trim();
    const key = normalized.toLocaleLowerCase("en");
    if (!unique.has(key)) unique.set(key, normalized);
  }
  return [...unique.values()];
}

// Validates array limits and trims each string item.
function normalizeArray(value, field) {
  const { count, length } = ARRAY_LIMITS[field];
  if (
    !Array.isArray(value) ||
    value.length > count ||
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length === 0 ||
        item.trim().length > length,
    )
  ) {
    throw new UserServiceError(400, "Validation failed", [
      {
        field,
        message: `Must be an array of at most ${count} non-empty strings, each at most ${length} characters`,
      },
    ]);
  }
  return value.map((item) => item.trim());
}

// Validates and normalizes supported nested profile fields
function normalizeNestedObject(field, value) {
  assertPlainObject(value, field);
  const schema = NESTED_PROFILE_FIELDS[field];
  const normalized = {};
  const errors = [];
  for (const [key, nestedValue] of Object.entries(value)) {
    // Reject fields that are not explicitly defined in the schema as updatable.
    if (!Object.hasOwn(schema, key)) {
      errors.push({
        field: `${field}.${key}`,
        message: "This field cannot be updated",
      });
    }

    // Validate boolean fields and store the value only if it matches the expected type.
    else if (schema[key] === "boolean") {
      if (typeof nestedValue !== "boolean") {
        errors.push({
          field: `${field}.${key}`,
          message: "Must be a boolean",
        });
      } else {
        normalized[key] = nestedValue;
      }
    }

    // Validate that the nested value is a string and does not exceed the maximum allowed length.
    else if (
      typeof nestedValue !== "string" ||
      nestedValue.trim().length > schema[key]
    ) {
      errors.push({
        field: `${field}.${key}`,
        message: `Must be a string of at most ${schema[key]} characters`,
      });
    } else {
      normalized[key] = nestedValue.trim();
    }
  }

  // Throw a validation error containing all collected errors if any validation checks fail.
  if (errors.length) {
    throw new UserServiceError(400, "Validation failed", errors);
  }

  // Reject the request if no valid, supported nested fields remain after validation.
  if (Object.keys(normalized).length === 0) {
    throw new UserServiceError(400, "Validation failed", [
      { field, message: "Provide at least one supported nested field" },
    ]);
  }
  return normalized;
}

// Validates and normalizes profile updates according to role-based permissions and field-specific rules.
function normalizeProfileUpdates(role, updates) {
  assertPlainObject(updates, "body");
  const allowedFields = getProfileFieldsForRole(role);
  const keys = Object.keys(updates);

  // Reject the request if no profile fields are provided for update.
  if (keys.length === 0) {
    throw new UserServiceError(400, "Validation failed", [
      { field: "body", message: "Provide at least one profile field" },
    ]);
  }

  const normalized = {};
  const errors = [];

  // Validate each requested profile field, normalize supported values, and collect validation errors.
  for (const field of keys) {
    // Reject unauthorized profile fields and skip further processing for the current field.
    if (!allowedFields.has(field)) {
      errors.push({ field, message: "This field cannot be updated" });
      continue;
    }

    const value = updates[field];

    // Validate and normalize nested profile fields, collecting validation errors when necessary.
    if (Object.hasOwn(NESTED_PROFILE_FIELDS, field)) {
      try {
        normalized[field] = normalizeNestedObject(field, value);
      } catch (error) {
        if (!(error instanceof UserServiceError)) throw error;
        errors.push(...(error.errors ?? [{ field, message: error.message }]));
      }
      continue;
    }

    // Normalize string profile fields, enforce length and required-field constraints, and handle nullable image fields.
    if (Object.hasOwn(STRING_LIMITS, field)) {
      // Allow profile picture and cover photo fields to be cleared by explicitly setting them to null.
      if (
        (field === "profilePicture" || field === "coverPhoto") &&
        value === null
      ) {
        normalized[field] = null;
        continue;
      }

      // Normalize and validate the profile field according to its length limit and required-field constraints.
      try {
        normalized[field] = normalizedString(
          value,
          field,
          STRING_LIMITS[field],
          field === "firstName" || field === "lastName",
        );
      } catch (error) {
        // Propagate unexpected errors and collect validation details from known user service errors.
        if (!(error instanceof UserServiceError)) throw error;
        errors.push(...(error.errors ?? [{ field, message: error.message }]));
      }
      continue;
    }

    if (Object.hasOwn(ARRAY_LIMITS, field)) {
      try {
        normalized[field] =
          field === "interests"
            ? normalizeInterests(value)
            : normalizeArray(value, field);
      } catch (error) {
        if (!(error instanceof UserServiceError)) throw error;
        errors.push(...(error.errors ?? [{ field, message: error.message }]));
      }
      continue;
    }
    if (field === "dateOfBirth") {
      if (value === null) {
        normalized[field] = null;
      } else if (
        (typeof value === "string" || value instanceof Date) &&
        !Number.isNaN(new Date(value).getTime())
      ) {
        normalized[field] = new Date(value);
      } else {
        errors.push({ field, message: "Must be a valid date or null" });
      }
      continue;
    }
    if (
      field === "gender" &&
      typeof value === "string" &&
      GENDER_OPTIONS.includes(value)
    ) {
      normalized[field] = value;
      continue;
    }
    if (
      field === "educationLevel" &&
      (value === null ||
        (typeof value === "string" && EDUCATION_LEVELS.includes(value)))
    ) {
      normalized[field] = value;
      continue;
    }
    if (
      field === "theme" &&
      typeof value === "string" &&
      THEME_OPTIONS.includes(value)
    ) {
      normalized[field] = value;
      continue;
    }
    if (field === "yearsOfExperience") {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        normalized[field] = value;
      } else {
        errors.push({ field, message: "Must be a non-negative number" });
      }
      continue;
    }
    errors.push({ field, message: "Must be a valid profile value" });
  }

  if (errors.length) {
    throw new UserServiceError(400, "Validation failed", errors);
  }
  return normalized;
}

// Retrieves a user by ID, optionally including the password field, and throws an error if not found.
async function findUserById(userId, options = {}) {
  assertValidUserId(userId);
  let query = userModel.findById(userId);
  if (options.includePassword) query = query.select("+password");
  const user = await query;
  if (!user) throw new UserServiceError(404, "User not found");
  return user;
}

// Applies validated profile updates while preserving existing nested field values.
function applyProfileUpdates(user, updates) {
  // Apply the profile updates, handling nested fields separately and supporting both Mongoose documents and plain JavaScript objects.
  for (const [field, value] of Object.entries(updates)) {
    if (Object.hasOwn(NESTED_PROFILE_FIELDS, field)) {
      for (const [nestedField, nestedValue] of Object.entries(value)) {
        if (typeof user.set === "function") {
          user.set(`${field}.${nestedField}`, nestedValue);
        } else {
          user[field] = { ...(user[field] ?? {}), [nestedField]: nestedValue };
        }
      }
    } else {
      if (typeof user.set === "function") user.set(field, value);
      else user[field] = value;
    }
  }
}

// Retrieves the authenticated user's profile with sensitive fields excluded.
export async function getMyProfile(userId) {
  const user = await findUserById(userId);
  return safeUser(user);
}

// Validates, applies, and saves profile updates, then returns the sanitized profile.
export async function updateMyProfile(userId, updates) {
  const user = await findUserById(userId);
  const normalizedUpdates = normalizeProfileUpdates(user.role, updates);
  applyProfileUpdates(user, normalizedUpdates);
  await user.save();
  return safeUser(user);
}

// Updates a learner's interests after role validation and returns the sanitized profile.
export async function updateMyInterests(userId, interests) {
  const user = await findUserById(userId);

  // Restrict learning interest updates to learner accounts.
  if (user.role !== "LEARNER") {
    throw new UserServiceError(
      403,
      "Only learners can update learning interests",
    );
  }

  // Normalize the submitted interests before saving them to the database.
  user.interests = normalizeInterests(interests);
  await user.save();

  // Return the user data without exposing sensitive information.
  return safeUser(user);
}

// Verifies the current password securely updates the password, and revokes active sessions.
export async function changeMyPassword(userId, currentPassword, newPassword) {
  // Validate that the current password is provided as a non-empty string.
  if (
    typeof newPassword !== "string" ||
    [...newPassword].length < PASSWORD_MIN_LENGTH ||
    Buffer.byteLength(newPassword, "utf8") > PASSWORD_MAX_BYTES
  ) {
    throw new UserServiceError(
      400,
      "New password must be at least 8 characters and no more than 72 UTF-8 bytes",
    );
  }

  // Retrieve the user by ID, including the password hash for password verification.
  const user = await findUserById(userId, { includePassword: true });

  // Verify the current password and reject the request if it does not match the stored password hash.
  if (!(await verifyPassword(currentPassword, user.password))) {
    throw new UserServiceError(400, "Current password is incorrect");
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  // Revoke all active sessions belonging to the user to require re-authentication on other devices.
  await sessionModel.updateMany(
    { user: user._id, revoked: false },
    { $set: { revoked: true } },
  );

  return { message: "Password changed successfully. Please sign in again." };
}
