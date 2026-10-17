import mongoose from "mongoose";
import { slugify } from "../../utils/slugify.js";

export const CATEGORY_STATUSES = Object.freeze(["ACTIVE", "INACTIVE"]);

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: CATEGORY_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    // Category Display
    image: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },

    icon: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    // Category Organization
    isFeatured: {
      type: Boolean,
      default: false,
    },

    displayOrder: {
      type: Number,
      min: 0,
      default: 0,
    },

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
  },
  { timestamps: true },
);

// Case-insensitive unique name ("Web Development" == "web development")
categorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);

// A category cannot be its own parent
categorySchema.pre("validate", function (next) {
  if (this.parentCategory && this.parentCategory.equals(this._id)) {
    this.invalidate("parentCategory", "A category cannot be its own parent");
  }
  next();
});

const categoryModel = mongoose.model("Category", categorySchema);

export default categoryModel;
