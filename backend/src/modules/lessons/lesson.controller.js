import mongoose from "mongoose";
import courseModel from "../courses/course.model.js";
import lessonModel, { LESSON_STATUSES } from "./lesson.model.js";

function parseLessonInput(body, partial = false) {
  const input = {};
  const errors = [];

  for (const [field, minimum, maximum] of [
    ["title", 3, 160],
    ["content", 10, 50000],
  ]) {
    if (partial && body[field] === undefined) {
      continue;
    }
    if (
      typeof body[field] !== "string" ||
      body[field].trim().length < minimum ||
      body[field].trim().length > maximum
    ) {
      errors.push({
        field,
        message: `Must be between ${minimum} and ${maximum} characters`,
      });
    } else {
      input[field] = body[field].trim();
    }
  }

  if (!partial || body.position !== undefined) {
    if (
      !Number.isInteger(body.position) ||
      body.position < 1 ||
      body.position > 10000
    ) {
      errors.push({
        field: "position",
        message: "Must be an integer between 1 and 10000",
      });
    } else {
      input.position = body.position;
    }
  }

  return { input, errors };
}

async function ownedCourseExists(courseId, instructorId) {
  return courseModel.exists({
    _id: courseId,
    instructor: instructorId,
  });
}

export async function listInstructorLessons(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  try {
    if (!(await ownedCourseExists(req.params.courseId, req.user._id))) {
      return res.status(404).json({ message: "Course not found" });
    }
    const lessons = await lessonModel
      .find({
        course: req.params.courseId,
        instructor: req.user._id,
      })
      .sort({ position: 1 })
      .lean();
    return res.json({ lessons });
  } catch (error) {
    return next(error);
  }
}

export async function createLesson(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  const { input, errors } = parseLessonInput(req.body ?? {});
  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }
  try {
    if (!(await ownedCourseExists(req.params.courseId, req.user._id))) {
      return res.status(404).json({ message: "Course not found" });
    }
    const lesson = await lessonModel.create({
      ...input,
      course: req.params.courseId,
      instructor: req.user._id,
      status: "DRAFT",
    });
    return res.status(201).json({ lesson });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A lesson already uses this position in the course",
      });
    }
    return next(error);
  }
}

export async function updateLesson(req, res, next) {
  if (
    !mongoose.isValidObjectId(req.params.courseId) ||
    !mongoose.isValidObjectId(req.params.lessonId)
  ) {
    return res.status(400).json({ message: "Course or lesson ID is invalid" });
  }
  const { input, errors } = parseLessonInput(req.body ?? {}, true);
  if (errors.length > 0 || Object.keys(input).length === 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors:
        errors.length > 0
          ? errors
          : [{ field: "body", message: "Provide at least one lesson field" }],
    });
  }
  try {
    if (!(await ownedCourseExists(req.params.courseId, req.user._id))) {
      return res.status(404).json({ message: "Course not found" });
    }
    const lesson = await lessonModel.findOneAndUpdate(
      {
        _id: req.params.lessonId,
        course: req.params.courseId,
        instructor: req.user._id,
      },
      { $set: { ...input, status: "DRAFT" } },
      { new: true, runValidators: true },
    );
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    return res.json({ lesson });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A lesson already uses this position in the course",
      });
    }
    return next(error);
  }
}

export async function deleteLesson(req, res, next) {
  if (
    !mongoose.isValidObjectId(req.params.courseId) ||
    !mongoose.isValidObjectId(req.params.lessonId)
  ) {
    return res.status(400).json({ message: "Course or lesson ID is invalid" });
  }
  try {
    if (!(await ownedCourseExists(req.params.courseId, req.user._id))) {
      return res.status(404).json({ message: "Course not found" });
    }
    const lesson = await lessonModel.findOneAndDelete({
      _id: req.params.lessonId,
      course: req.params.courseId,
      instructor: req.user._id,
    });
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export async function listPublishedLessons(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.courseId)) {
    return res.status(400).json({ message: "Course ID is invalid" });
  }
  try {
    const course = await courseModel
      .findOne({ _id: req.params.courseId, status: "PUBLISHED" })
      .select("_id")
      .lean();
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }
    const lessons = await lessonModel
      .find({ course: req.params.courseId, status: "PUBLISHED" })
      .sort({ position: 1 })
      .lean();
    return res.json({ lessons });
  } catch (error) {
    return next(error);
  }
}

export async function listLessonsForModeration(req, res, next) {
  const status = req.query.status ?? "DRAFT";
  if (!LESSON_STATUSES.includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: `Must be one of: ${LESSON_STATUSES.join(", ")}`,
        },
      ],
    });
  }
  try {
    const lessons = await lessonModel
      .find({ status })
      .populate("course", "title status")
      .populate("instructor", "firstName lastName username email")
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ lessons });
  } catch (error) {
    return next(error);
  }
}

export async function moderateLesson(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.lessonId)) {
    return res.status(400).json({ message: "Lesson ID is invalid" });
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
    const lesson = await lessonModel.findByIdAndUpdate(
      req.params.lessonId,
      { $set: { status } },
      { new: true, runValidators: true },
    );
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }
    return res.json({ lesson });
  } catch (error) {
    return next(error);
  }
}
