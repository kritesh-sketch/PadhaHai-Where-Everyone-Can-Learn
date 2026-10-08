import mongoose from "mongoose";

export const LESSON_STATUSES = Object.freeze([
  "DRAFT",
  "PUBLISHED",
  "REJECTED",
]);

const lessonSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 160,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 50000,
    },
    position: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: LESSON_STATUSES,
      default: "DRAFT",
      index: true,
    },
  },
  { timestamps: true },
);

lessonSchema.index({ course: 1, position: 1 }, { unique: true });

const lessonModel = mongoose.model("Lesson", lessonSchema);

export default lessonModel;
