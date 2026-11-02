import mongoose from "mongoose";
import {
  COURSE_STATUSES,
  COURSE_LEVELS,
  COURSE_TYPES,
  COURSE_VISIBILITIES,
} from "./course.constants.js";

const courseSchema = new mongoose.Schema(
  {
    // 1. BASIC COURSE INFORMATION

    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 160,
    },

    subtitle: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },

    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 10000,
    },

    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    thumbnail: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    // 2. COURSE OWNERSHIP & CLASSIFICATION

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

    tags: {
      type: [String],
      default: [],
    },

    // 3. COURSE TYPE & LEARNING INFORMATION

    courseType: {
      type: String,
      enum: COURSE_TYPES,
      default: "SELF_PACED",
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

    // 4. COURSE CONTENT SUMMARY

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

    // 5. ENROLLMENT SETTINGS

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

    // 6. COURSE VISIBILITY & FEATURED STATUS

    visibility: {
      type: String,
      enum: COURSE_VISIBILITIES,
      default: "PUBLIC",
    },

    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 7. PUBLICATION & APPROVAL

    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: "DRAFT",
      index: true,
    },

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

    // 8. COURSE STATISTICS

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

    // 9. COURSE CLASSIFICATION

    subcategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    // 10. COURSE DISCOVERY & SEARCH

    searchKeywords: {
      type: [String],
      default: [],
    },

    // 11. ENROLLMENT STATISTICS

    enrollmentCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // 12. COURSE INTERACTION SETTINGS

    allowDiscussions: {
      type: Boolean,
      default: true,
    },

    allowReviews: {
      type: Boolean,
      default: true,
    },

    // 13. COURSE DELETION & RECOVERY

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// DATABASE INDEXES
// Public course listing and newest courses
courseSchema.index({
  status: 1,
  visibility: 1,
  isDeleted: 1,
  createdAt: -1,
});

// Popular courses
courseSchema.index({
  status: 1,
  enrollmentCount: -1,
});

// Top-rated courses
courseSchema.index({
  status: 1,
  averageRating: -1,
});

// Instructor's courses by status
courseSchema.index({
  instructor: 1,
  status: 1,
});

courseSchema.index({
  status: 1,
  visibility: 1,
  isDeleted: 1,
  enrollmentCount: -1,
});

const courseModel = mongoose.model("Course", courseSchema);

export default courseModel;
