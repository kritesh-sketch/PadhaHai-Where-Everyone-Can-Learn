import mongoose from "mongoose";
import categoryModel from "../categories/category.model.js";
import courseModel, { COURSE_STATUSES } from "./course.model.js";

function parseCourseInput(body, partial = false) {
  const input = {};
  const errors = [];

  for (const [field, options] of Object.entries({
    title: { minimum: 3, maximum: 160 },
    description: { minimum: 10, maximum: 10000 },
  })) {
    if (partial && body[field] === undefined) {
      continue;
    }
    if (
      typeof body[field] !== "string" ||
      body[field].trim().length < options.minimum ||
      body[field].trim().length > options.maximum
    ) {
      errors.push({
        field,
        message: `Must be between ${options.minimum} and ${options.maximum} characters`,
      });
    } else {
      input[field] = body[field].trim();
    }
  }

  if (body.category === undefined) {
    return { input, errors };
  }

  if (body.category === null || body.category === "") {
    input.category = null;
  } else if (
    typeof body.category === "string" &&
    mongoose.isValidObjectId(body.category)
  ) {
    input.category = body.category;
  } else {
    errors.push({ field: "category", message: "Must be a valid category ID" });
  }

  return { input, errors };
}

async function validateCategory(categoryId) {
  return !categoryId || (await categoryModel.exists({ _id: categoryId }));
}

export async function listPublishedCourses(_req, res, next) {
  try {
    const courses = await courseModel
      .find({ status: "PUBLISHED" })
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ courses });
  } catch (error) {
    return next(error);
  }
}

export async function getPublishedCourse(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }

  try {
    const course = await courseModel
      .findOne({ _id: req.params.courseId, status: "PUBLISHED" })
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username")
      .lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.json({ course });
  } catch (error) {
    return next(error);
  }
}

export async function listInstructorCourses(req, res, next) {
  try {
    const courses = await courseModel
      .find({ instructor: req.user._id })
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ courses });
  } catch (error) {
    return next(error);
  }
}

export async function createCourse(req, res, next) {
  const { input, errors } = parseCourseInput(req.body ?? {});
  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    if (!(await validateCategory(input.category))) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "category", message: "Category does not exist" }],
      });
    }

    const course = await courseModel.create({
      ...input,
      instructor: req.user._id,
      status: "DRAFT",
    });
    return res.status(201).json({ course });
  } catch (error) {
    return next(error);
  }
}

export async function updateInstructorCourse(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  const { input, errors } = parseCourseInput(req.body ?? {}, true);
  if (errors.length > 0 || Object.keys(input).length === 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors:
        errors.length > 0
          ? errors
          : [{ field: "body", message: "Provide at least one course field" }],
    });
  }

  try {
    if (
      Object.hasOwn(input, "category") &&
      !(await validateCategory(input.category))
    ) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [{ field: "category", message: "Category does not exist" }],
      });
    }

    const course = await courseModel.findOneAndUpdate(
      { _id: req.params.courseId, instructor: req.user._id },
      { $set: { ...input, status: "DRAFT" } },
      { new: true, runValidators: true },
    );
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.json({ course });
  } catch (error) {
    return next(error);
  }
}

export async function deleteInstructorCourse(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  try {
    const course = await courseModel.findOneAndDelete({
      _id: req.params.courseId,
      instructor: req.user._id,
    });
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function listCoursesForModeration(req, res, next) {
  const status = req.query.status ?? "DRAFT";
  if (!COURSE_STATUSES.includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: `Must be one of: ${COURSE_STATUSES.join(", ")}`,
        },
      ],
    });
  }

  try {
    const courses = await courseModel
      .find({ status })
      .populate("category", "name slug")
      .populate("instructor", "firstName lastName username email")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ courses });
  } catch (error) {
    return next(error);
  }
}

export async function moderateCourse(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  const { status } = req.body ?? {};
  if (!["PUBLISHED", "REJECTED"].includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: "Must be either PUBLISHED or REJECTED",
        },
      ],
    });
  }

  try {
    const course = await courseModel.findByIdAndUpdate(
      req.params.courseId,
      { $set: { status } },
      { new: true, runValidators: true },
    );
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    return res.json({ course });
  } catch (error) {
    return next(error);
  }
}
