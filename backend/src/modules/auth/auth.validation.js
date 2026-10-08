const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRegistration(req, res, next) {
  const body = req.body ?? {};
  const errors = [];

  for (const field of ["firstName", "lastName"]) {
    if (!isNonEmptyString(body[field]) || body[field].trim().length > 80) {
      errors.push({
        field,
        message: "Must be a non-empty string of at most 80 characters",
      });
    }
  }

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

  if (
    !isNonEmptyString(body.email) ||
    body.email.trim().length > 254 ||
    !EMAIL_PATTERN.test(body.email.trim())
  ) {
    errors.push({ field: "email", message: "Must be a valid email address" });
  }

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

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  return next();
}

function validateLogin(req, res, next) {
  const body = req.body ?? {};
  const identifier = body.identifier ?? body.email ?? body.username;
  const errors = [];

  if (!isNonEmptyString(identifier)) {
    errors.push({
      field: "identifier",
      message: "Email address or username is required",
    });
  }

  if (!isNonEmptyString(body.password)) {
    errors.push({ field: "password", message: "Password is required" });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
    });
  }

  return next();
}

export { validateLogin, validateRegistration };
