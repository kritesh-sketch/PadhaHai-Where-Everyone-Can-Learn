import mongoose from "mongoose";
import sessionModel from "../auth/session.model.js";
import userModel from "./user.model.js";
import { uploadProfilePicture } from "../../services/profile-picture.service.js";
import {
  changeMyPassword,
  getMyProfile,
  updateMyInterests,
  updateMyProfile,
  UserServiceError,
} from "./user.service.js";

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
  "profilePicture",
  "headline",
  "currentPosition",
  "bio",
  "location",
  "website",
  "socialLinks",
  "skills",
  "coverPhoto",
  "createdAt",
  "updatedAt",
];

// Return only the approved profile fields to prevent sensitive user data from being exposed in API responses.
function safeUser(user) {
  const result = {};

  // Copy only fields explicitly permitted in the profile response.
  for (const field of PROFILE_RESPONSE_FIELDS) {
    if (user[field] !== undefined) result[field] = user[field];
  }

  return result;
}

// Handle known user service errors with appropriate HTTP status codes and structured error responses.
function handleUserServiceError(error, res, next) {
  if (error instanceof UserServiceError) {
    return res.status(error.statusCode).json({
      message: error.message,
      // Include validation details only when additional error information is available.
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }
  // Forward unexpected errors to the centralized error-handling middleware.
  return next(error);
}

// Validate the user ID route parameter before allowing the request to proceed.
function validateUserId(req, res) {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    // Return a 400 Bad Request response when the user ID is invalid.
    res.status(400).json({ message: "User ID is invalid" });
    return false;
  }

  // Allow the request to proceed when the user ID is valid.
  return true;
}

export async function getProfile(req, res, next) {
  try {
    // Fetch the profile using the authenticated user's ID.
    const user = await getMyProfile(req.user._id);

    // Return the user's profile as a JSON response.
    return res.json({ user });
  } catch (error) {
    // Handle known service errors and forward unexpected errors to the error middleware.
    return handleUserServiceError(error, res, next);
  }
}

// Update the authenticated user's profile and return the updated user data.
export async function updateProfile(req, res, next) {
  try {
    // Pass the authenticated user's ID and submitted profile fields to the service.
    const user = await updateMyProfile(req.user._id, req.body ?? {});

    return res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    // Handle known service errors and forward unexpected errors to the error middleware.
    return handleUserServiceError(error, res, next);
  }
}

// Update the authenticated learner's learning interests and return the updated profile.
export async function updateInterests(req, res, next) {
  try {
    // Pass the authenticated user's ID and submitted interests to the service.
    const user = await updateMyInterests(req.user._id, req.body?.interests);

    // Return a success message and the updated user profile.
    return res.json({
      message: "Learning interests updated successfully",
      user,
    });
  } catch (error) {
    // Handle known service errors and forward unexpected errors to the error middleware.
    return handleUserServiceError(error, res, next);
  }
}

// Deactivate the authenticated user's account and revoke all active sessions.
export async function deactivateAccount(req, res, next) {
  // Prevent administrators from changing their account status through this endpoint.
  if (req.user.role === "ADMIN") {
    return res.status(409).json({
      message:
        "Administrators must use admin account management to change status",
    });
  }

  try {
    // Mark the account as inactive and return the updated user document.
    const user = await userModel
      .findByIdAndUpdate(
        req.user._id,
        { $set: { status: "INACTIVE", isActive: false } },
        { new: true, runValidators: true },
      )
      .select("-password");

    // Return a 404 response if the user account does not exist.
    if (!user) return res.status(404).json({ message: "User not found" });

    // Revoke all active sessions to prevent further use of existing sessions.
    await sessionModel.updateMany(
      { user: user._id, revoked: false },
      { $set: { revoked: true } },
    );

    // Return a confirmation message and the sanitized user profile.
    return res.json({
      message: "Account deactivated. Reactivate it before signing in again.",
      user: safeUser(user),
    });
  } catch (error) {
    // Forward unexpected errors to the centralized error-handling middleware.
    return next(error);
  }
}

// Change the authenticated user's password and return the service response.
export async function changePassword(req, res, next) {
  const { currentPassword, newPassword } = req.body ?? {};
  try {
    // Verify the current password, update the password, and revoke active sessions.
    const result = await changeMyPassword(
      req.user._id,
      currentPassword,
      newPassword,
    );

    // Return the password change confirmation message.
    return res.json(result);
  } catch (error) {
    // Handle known service errors and forward unexpected errors to the error middleware.
    return handleUserServiceError(error, res, next);
  }
}

export async function uploadPicture(req, res, next) {
  // Ensure a profile picture was included in the uploaded request.
  if (!req.file) {
    return res.status(400).json({
      message:
        "Upload a JPEG, PNG, or WebP image using the profilePicture field",
    });
  }

  try {
    // Upload the image for the authenticated user and retrieve its stored URL or path.
    const profilePicture = await uploadProfilePicture(
      req.user._id.toString(),
      req.file,
    );

    // Update the user's profile picture and return the updated user document.
    const user = await userModel
      .findByIdAndUpdate(
        req.user._id,
        { $set: { profilePicture } },
        { new: true, runValidators: true },
      )
      // Exclude the password field from the returned user document.
      .select("-password");

    // Return a 404 response if the authenticated user's record no longer exists.
    if (!user) return res.status(404).json({ message: "User not found" });

    // Return a success message and only the user fields allowed in the response.
    return res.json({
      message: "Profile picture uploaded successfully",
      user: safeUser(user),
    });
  } catch (error) {
    // Report unavailable storage configuration without treating it as a server error.
    if (error.code === "STORAGE_CONFIGURATION_MISSING") {
      return res.status(503).json({ message: error.message });
    }

    // Forward unexpected errors to the centralized error-handling middleware.
    return next(error);
  }
}

export async function getUserDetails(req, res, next) {
  // Validate the requested user ID before querying the database.
  if (!validateUserId(req, res)) return;

  // Allow access only to administrators or the user requesting their own details.
  if (
    req.user.role !== "ADMIN" &&
    req.user._id.toString() !==
      new mongoose.Types.ObjectId(req.params.userId).toString()
  ) {
    return res.status(403).json({ message: "You cannot view this user" });
  }

  try {
    // Find the requested user by their ID.
    let userQuery = userModel.findById(req.params.userId);

    // Exclude the password field if the query supports field selection.
    if (typeof userQuery.select === "function") {
      userQuery = userQuery.select("-password");
    }

    // Execute the query to retrieve the user document.
    const user = await userQuery;
    if (!user) return res.status(404).json({ message: "User not found" });

    // Return the sanitized user details.
    return res.json({ user: safeUser(user) });
  } catch (error) {
    // Forward unexpected errors to the centralized error-handling middleware.
    return next(error);
  }
}
