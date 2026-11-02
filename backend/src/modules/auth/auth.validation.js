// Matches email addresses with a basic structure consisting of a local part,
// an @ symbol, a domain, and a dot-separated suffix.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Matches usernames containing only ASCII letters, digits, and underscores.
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Determines whether a value is a non-empty string after trimming whitespace.
 *
 * @param {*} value - The value to validate.
 * @returns {boolean} True if the value is a string containing non-whitespace characters; otherwise, false.
 */
function isNonEmptyString(value) {
  // Ensure the value is a string and contains non-whitespace characters.
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the request body for user registration.
 *
 * Checks required name fields, username format, email validity, and
 * password length constraints. Returns a structured validation response
 * if any field fails validation; otherwise, passes control to the next
 * middleware or route handler.
 *
 * @param {Object} req - The request object containing registration data.
 * @param {Object} res - The response object used to return validation errors.
 * @param {Function} next - The middleware function for continuing the request.
 * @returns {Object|void} A validation error response or the result of next().
 */
function validateRegistration(req, res, next) {
  // Safely obtain the request body and initialize the validation error list.
  const body = req.body ?? {};
  const errors = [];

  // Validate that both name fields contain non-empty strings of at most 80 characters.
  for (const field of ["firstName", "lastName"]) {
    if (!isNonEmptyString(body[field]) || body[field].trim().length > 80) {
      errors.push({
        field,
        message: "Must be a non-empty string of at most 80 characters",
      });
    }
  }

  // Validate the username's length and permitted character pattern.
  if (
    !isNonEmptyString(body.username) ||
    body.username.trim().length < 3 ||
    body.username.trim().length > 30 ||
    !USERNAME_PATTERN.test(body.username.trim())
  ) {
    errors.push({
      field: "username",
      message: "Must be 3-30 letters, numbers, or underscores",
    });
  }

  // Validate the email address's length and format.
  if (
    !isNonEmptyString(body.email) ||
    body.email.trim().length > 254 ||
    !EMAIL_PATTERN.test(body.email.trim())
  ) {
    errors.push({ field: "email", message: "Must be a valid email address" });
  }

  // Enforce the minimum password length and maximum UTF-8 byte limit.
  if (
    !isNonEmptyString(body.password) ||
    [...body.password].length < 8 ||
    Buffer.byteLength(body.password, "utf8") > 72
  ) {
    errors.push({
      field: "password",
      message: "Must be at least 8 characters and no more than 72 UTF-8 bytes",
    });
  }

  // Reject the request if one or more fields fail validation.
  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  // Continue to the next middleware when all fields are valid.
  return next();
}

/**
 * Validates the request body for user login.
 *
 * Ensures that a login identifier and password are provided before
 * allowing the request to proceed to the authentication handler.
 * Supports an email address or username as the login identifier.
 *
 * @param {Object} req - The request object containing login credentials.
 * @param {Object} res - The response object used to return validation errors.
 * @param {Function} next - The middleware function for continuing the request.
 * @returns {Object|void} A validation error response or the result of next().
 */
function validateLogin(req, res, next) {
  // Safely obtain the request body and initialize the validation error list.
  const body = req.body ?? {};
  const identifier = body.identifier ?? body.email ?? body.username;
  const errors = [];

  // Ensure that an email address or username has been provided.
  if (!isNonEmptyString(identifier)) {
    errors.push({
      field: "identifier",
      message: "Email address or username is required",
    });
  }

  // Ensure that the password is a non-empty string.
  if (!isNonEmptyString(body.password)) {
    errors.push({ field: "password", message: "Password is required" });
  }

  if (body.rememberMe !== undefined && typeof body.rememberMe !== "boolean") {
    errors.push({ field: "rememberMe", message: "Must be a boolean" });
  }

  // Reject the request if any required login fields are invalid.
  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  // Continue to the authentication handler when validation succeeds.
  return next();
}

function validateEmailRequest(req, res, next) {
  const email = req.body?.email;
  if (
    !isNonEmptyString(email) ||
    email.trim().length > 254 ||
    !EMAIL_PATTERN.test(email.trim())
  ) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [{ field: "email", message: "Must be a valid email address" }],
    });
  }
  return next();
}

function validateVerificationToken(req, res, next) {
  const token = req.body?.token;
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/i.test(token)
  ) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [{ field: "token", message: "Must be a valid verification token" }],
    });
  }
  return next();
}

export {
  validateEmailRequest,
  validateLogin,
  validateRegistration,
  validateVerificationToken,
};
