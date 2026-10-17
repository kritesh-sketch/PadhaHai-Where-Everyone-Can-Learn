import mongoose from "mongoose";

export const LESSON_STATUSES = Object.freeze([
  "DRAFT",
  "PUBLISHED",
  "REJECTED",
]);

const lessonSchema = new mongoose.Schema(
  {
    // Module Relationship
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      index: true,
    },

    // Lesson URL
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    // Lesson Type
    type: {
      type: String,
      enum: ["VIDEO", "TEXT", "DOCUMENT", "QUIZ"],
      default: "TEXT",
      required: true,
    },

    // Video Information
    videoUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    videoDurationSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Supporting Resources
    resourceUrls: {
      type: [String],
      default: [],
    },

    // Learning Objectives
    learningObjectives: {
      type: [String],
      default: [],
    },

    // Lesson Access
    isPreviewFree: {
      type: Boolean,
      default: false,
    },

    // Publication Information
    publishedAt: {
      type: Date,
      default: null,
    },

    // Management Information
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

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
