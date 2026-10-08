import { USER_ROLES } from "../modules/auth/user.model.js";

export function authorizeRoles(...allowedRoles) {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !USER_ROLES.includes(role))
  ) {
    throw new TypeError("authorizeRoles requires one or more valid user roles");
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication is required" });
    }

    if (!USER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "User role is missing or invalid" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You are not authorized" });
    }

    return next();
  };
}

export default authorizeRoles;
