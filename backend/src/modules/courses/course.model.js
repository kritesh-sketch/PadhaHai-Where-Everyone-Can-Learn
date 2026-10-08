import mongoose from "mongoose";

export const COURSE_STATUSES = Object.freeze([
  "DRAFT",
  "PUBLISHED",
  "REJECTED",
]);

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 10000,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: "DRAFT",
      index: true,
    },
  },
  { timestamps: true },
);

const courseModel = mongoose.model("Course", courseSchema);

export default courseModel;
