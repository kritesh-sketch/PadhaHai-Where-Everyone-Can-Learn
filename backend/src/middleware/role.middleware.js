import { USER_ROLES } from "../modules/users/user.model.js";

/**
 * Creates middleware that restricts access to specified user roles.
 *
 * @param {...string} allowedRoles - Roles permitted to access the resource.
 * @returns {Function} Express authorization middleware.
 * @throws {TypeError} If the allowed roles are missing or invalid.
 */
export function authorizeRoles(...allowedRoles) {
  // Validate role configuration when the middleware is created.
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !USER_ROLES.includes(role))
  ) {
    throw new TypeError("authorizeRoles requires one or more valid user roles");
  }

  return (req, res, next) => {
    // Authentication must run before authorization.
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication is required",
      });
    }

    // Reject missing or invalid roles.
    if (!USER_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        message: "User role is missing or invalid",
      });
    }

    // Check whether the user's role is allowed.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You are not authorized",
      });
    }

    return next();
  };
}

export default authorizeRoles;
