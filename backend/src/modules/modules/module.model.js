import mongoose from "mongoose";

export const CATEGORY_STATUSES = Object.freeze(["ACTIVE", "INACTIVE"]);

const categorySchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: 2,
      maxlength: 80,
      unique: true,
    },

    slug: {
      type: String,
      required: [true, "Category slug is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // Category Display
    image: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    // Category Management
    status: {
      type: String,
      enum: CATEGORY_STATUSES,
      default: "ACTIVE",
      index: true,
    },

    displayOrder: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Subcategory Support
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    // SEO Information
    metaTitle: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },

    metaDescription: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    // Admin Information
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

    // Learning Objectives
    learningObjectives: {
      type: [String],
      default: [],
    },

    // Module Thumbnail
    thumbnail: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    // Preview Access
    isPreviewFree: {
      type: Boolean,
      default: false,
    },

    // Content Availability
    availableFrom: {
      type: Date,
      default: null,
    },

    // Optional Learning Requirements
    estimatedCompletionMinutes: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for category filtering and sorting
categorySchema.index({ status: 1, displayOrder: 1 });
categorySchema.index({ parentCategory: 1, status: 1 });

const categoryModel = mongoose.model("Category", categorySchema);

export default categoryModel;
