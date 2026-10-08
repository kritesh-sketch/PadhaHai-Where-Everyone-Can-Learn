import mongoose from "mongoose";
import courseModel from "../courses/course.model.js";
import sessionModel from "../auth/session.model.js";
import userModel, { USER_ROLES } from "../users/user.model.js";
import categoryModel from "../categories/category.model.js";
import lessonModel from "../lessons/lesson.model.js";

export async function updateUser(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: "User ID is invalid" });
  }

  const body = req.body ?? {};
  const updates = {};
  const errors = [];
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
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      errors.push({ field: "isActive", message: "Must be a boolean" });
    } else {
      updates.isActive = body.isActive;
    }
  }
  if (errors.length > 0 || Object.keys(updates).length === 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors:
        errors.length > 0
          ? errors
          : [{ field: "body", message: "Provide role or isActive" }],
    });
  }

  try {
    const user = await userModel
      .findByIdAndUpdate(
        req.params.userId,
        { $set: updates },
        { new: true, runValidators: true },
      )
      .select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (updates.isActive === false) {
      await sessionModel.updateMany(
        { user: user._id, revoked: false },
        { $set: { revoked: true } },
      );
    }
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

export async function getDashboard(_req, res, next) {
  try {
    const [
      totalUsers,
      activeUsers,
      students,
      instructors,
      administrators,
      totalCourses,
      publishedCourses,
      coursesAwaitingModeration,
      lessonsAwaitingModeration,
      totalCategories,
    ] = await Promise.all([
      userModel.countDocuments(),
      userModel.countDocuments({ isActive: true }),
      userModel.countDocuments({ role: "STUDENT" }),
      userModel.countDocuments({ role: "INSTRUCTOR" }),
      userModel.countDocuments({ role: "ADMIN" }),
      courseModel.countDocuments(),
      courseModel.countDocuments({ status: "PUBLISHED" }),
      courseModel.countDocuments({ status: "DRAFT" }),
      lessonModel.countDocuments({ status: "DRAFT" }),
      categoryModel.countDocuments(),
    ]);

    return res.json({
      dashboard: {
        users: {
          total: totalUsers,
          active: activeUsers,
          students,
          instructors,
          administrators,
        },
        courses: {
          total: totalCourses,
          published: publishedCourses,
          awaitingModeration: coursesAwaitingModeration,
        },
        lessons: { awaitingModeration: lessonsAwaitingModeration },
        categories: { total: totalCategories },
      },
    });
  } catch (error) {
    return next(error);
  }
}
