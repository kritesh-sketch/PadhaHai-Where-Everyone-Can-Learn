import mongoose from "mongoose";
import courseModel from "../courses/course.model.js";
import sessionModel from "../auth/session.model.js";
import userModel, {
  ACCOUNT_STATUSES,
  USER_ROLES,
} from "../users/user.model.js";
import { validateAdminUserUpdate } from "../users/user.validation.js";
import categoryModel from "../categories/category.model.js";
import lessonModel from "../lessons/lesson.model.js";

export async function updateUser(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.userId)) {
    return res.status(400).json({ message: "User ID is invalid" });
  }

  const body = req.body ?? {};
  const { updates, errors } = validateAdminUserUpdate(body);
  if (errors.length > 0 || Object.keys(updates).length === 0) {
    const userFacingErrors =
      errors.length > 0
        ? errors
        : [{ field: "body", message: "Provide role, status, or isActive" }];
    return res.status(400).json({
      message: "Validation failed",
      errors: userFacingErrors,
    });
  }

  try {
    const existingUser = await userModel.findById(req.params.userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const changesOwnAdminAccess =
      existingUser.role === "ADMIN" &&
      req.user._id.toString() === existingUser._id.toString() &&
      ((updates.role !== undefined && updates.role !== "ADMIN") ||
        (updates.status !== undefined && updates.status !== "ACTIVE"));
    if (changesOwnAdminAccess) {
      return res.status(409).json({
        message: "Administrators cannot remove their own administrative access",
      });
    }

    const removesAdminAccess =
      existingUser.role === "ADMIN" &&
      ((updates.role !== undefined && updates.role !== "ADMIN") ||
        (updates.status !== undefined && updates.status !== "ACTIVE"));
    if (removesAdminAccess) {
      let adminQuery = userModel.find({ role: "ADMIN" });
      if (typeof adminQuery.select === "function") {
        adminQuery = adminQuery.select("_id status isActive");
      }
      const admins = await adminQuery.lean();
      const hasAnotherActiveAdmin = admins.some(
        (admin) =>
          admin._id.toString() !== existingUser._id.toString() &&
          (admin.status === "ACTIVE" ||
            (admin.status === undefined && admin.isActive !== false)),
      );
      if (!hasAnotherActiveAdmin) {
        return res.status(409).json({
          message:
            "The last active administrator cannot be deactivated or demoted",
        });
      }
    }

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
    if (updates.isActive === false || updates.status === "SUSPENDED") {
      await sessionModel.updateMany(
        { user: user._id, revoked: false },
        { $set: { revoked: true } },
      );
    }
    return res.json({ user });
  } catch (error) {
    if (error.code === 11000) {
      const field = error.keyPattern?.email ? "Email" : "Username";
      return res.status(409).json({ message: `${field} is already in use` });
    }
    return next(error);
  }
}

export async function listUsers(req, res, next) {
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function accountStatusQuery(status) {
    if (status === "ACTIVE") {
      return {
        $or: [
          { status: "ACTIVE" },
          { status: { $exists: false }, isActive: true },
        ],
      };
    }
    if (status === "INACTIVE") {
      return {
        $or: [
          { status: "INACTIVE" },
          { status: { $exists: false }, isActive: false },
        ],
      };
    }
    return { status: "SUSPENDED" };
  }

  const { role, status } = req.query;
  const search = req.query.search ?? req.query.q ?? "";
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 25);
  const sortBy = req.query.sortBy ?? "createdAt";
  const sortOrder = req.query.sortOrder ?? "desc";
  const errors = [];

  if (role !== undefined && !USER_ROLES.includes(role)) {
    errors.push({
      field: "role",
      message: `Must be one of: ${USER_ROLES.join(", ")}`,
    });
  }
  if (status !== undefined && !ACCOUNT_STATUSES.includes(status)) {
    errors.push({
      field: "status",
      message: `Must be one of: ${ACCOUNT_STATUSES.join(", ")}`,
    });
  }
  if (typeof search !== "string" || search.length > 100) {
    errors.push({ field: "search", message: "Must be at most 100 characters" });
  }
  if (!Number.isInteger(page) || page < 1) {
    errors.push({ field: "page", message: "Must be a positive integer" });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    errors.push({
      field: "limit",
      message: "Must be an integer from 1 to 100",
    });
  }
  if (
    !["createdAt", "name", "firstName", "lastName", "username"].includes(sortBy)
  ) {
    errors.push({
      field: "sortBy",
      message: "Must be one of: createdAt, name, firstName, lastName, username",
    });
  }
  if (!["asc", "desc"].includes(sortOrder)) {
    errors.push({ field: "sortOrder", message: "Must be asc or desc" });
  }
  if (errors.length) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  const filters = [];
  if (role) filters.push({ role });
  if (status) filters.push(accountStatusQuery(status));
  if (search.trim()) {
    const expression = new RegExp(escapeRegex(search.trim()), "i");
    filters.push({
      $or: [
        { firstName: expression },
        { lastName: expression },
        { username: expression },
        { email: expression },
      ],
    });
  }
  const query = filters.length > 1 ? { $and: filters } : (filters[0] ?? {});

  try {
    let baseQuery = userModel.find(query);
    if (typeof baseQuery.select === "function") {
      baseQuery = baseQuery.select(
        "firstName lastName username email phone role status isActive profilePicture createdAt updatedAt",
      );
    }
    if (typeof baseQuery.sort === "function") {
      const direction = sortOrder === "asc" ? 1 : -1;
      baseQuery = baseQuery.sort(
        sortBy === "name"
          ? { firstName: direction, lastName: direction, _id: 1 }
          : { [sortBy]: direction, _id: 1 },
      );
    }

    let users;
    let allResults = null;
    // Mongoose Query supports skip/limit chaining
    if (
      typeof baseQuery.skip === "function" &&
      typeof baseQuery.limit === "function"
    ) {
      users = await baseQuery
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
    } else if (typeof baseQuery.lean === "function") {
      // Test stubs return a chain with lean() returning all items; slice for pagination
      allResults = await baseQuery.lean();
      users = Array.isArray(allResults)
        ? allResults.slice((page - 1) * limit, (page - 1) * limit + limit)
        : allResults;
    } else {
      // Fallback: await the query result and slice
      allResults = await baseQuery;
      users = Array.isArray(allResults)
        ? allResults.slice((page - 1) * limit, (page - 1) * limit + limit)
        : allResults;
    }

    const total = Array.isArray(allResults)
      ? allResults.length
      : await userModel.countDocuments(query);

    return res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
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
      userModel.countDocuments({ role: "LEARNER" }),
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
