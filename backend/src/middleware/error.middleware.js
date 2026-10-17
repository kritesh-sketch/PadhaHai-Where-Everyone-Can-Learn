import jwt from "jsonwebtoken";
import mongoose from "mongoose";

function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.code === 11000) {
    const field = error.keyPattern?.email ? "Email" : "Username";
    return res.status(409).json({ message: `${field} is already registered` });
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      message: "Validation failed",
      errors: Object.values(error.errors).map((item) => ({
        field: item.path,
        message: item.message,
      })),
    });
  }

  if (error instanceof jwt.TokenExpiredError) {
    return res.status(401).json({ message: "Token has expired" });
  }

  if (
    error instanceof jwt.JsonWebTokenError ||
    error instanceof jwt.NotBeforeError
  ) {
    return res.status(401).json({ message: "Token is invalid" });
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ message: "Request body contains invalid JSON" });
  }

  console.error("Unhandled request error:", error);
  return res.status(500).json({ message: "Internal server error" });
}

export default errorHandler;
