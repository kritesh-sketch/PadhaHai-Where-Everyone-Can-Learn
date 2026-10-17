import mongoose from "mongoose";

export const COURSE_STATUSES = Object.freeze([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
  "REJECTED",
]);
export const COURSE_LEVELS = Object.freeze([
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
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
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 10000,
    },
    thumbnail: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
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
    level: {
      type: String,
      enum: COURSE_LEVELS,
      default: "BEGINNER",
    },
    language: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "English",
    },
    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: "DRAFT",
      index: true,
    },

    // Course Details
    subtitle: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },

    courseType: {
      type: String,
      enum: ["SELF_PACED", "LIVE", "BLENDED"],
      default: "SELF_PACED",
    },

    tags: {
      type: [String],
      default: [],
    },

    learningObjectives: {
      type: [String],
      default: [],
    },

    learningOutcomes: {
      type: [String],
      default: [],
    },

    requirements: {
      type: [String],
      default: [],
    },

    targetAudience: {
      type: [String],
      default: [],
    },

    // Course Content Summary
    totalModules: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalLessons: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalDurationMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Enrollment Settings
    enrollmentOpen: {
      type: Boolean,
      default: true,
    },

    maxStudents: {
      type: Number,
      default: null,
      min: 1,
    },

    certificateAvailable: {
      type: Boolean,
      default: false,
    },
    // Visibility
    visibility: {
      type: String,
      enum: ["PUBLIC", "UNLISTED", "PRIVATE"],
      default: "PUBLIC",
    },

    // Featured Course
    isFeatured: {
      type: Boolean,
      default: false,
    },

    // Moderation
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    publishedAt: {
      type: Date,
      default: null,
    },

    // Course Statistics
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalViews: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

const courseModel = mongoose.model("Course", courseSchema);

export default courseModel;
