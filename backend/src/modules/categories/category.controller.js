import mongoose from "mongoose";
import courseModel from "../courses/course.model.js";
import categoryModel from "./category.model.js";

function validateCategoryInput(body, partial = false) {
  const input = {};
  const errors = [];
  const name = body.name;
  const description = body.description;

  if (!partial || name !== undefined) {
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 80
    ) {
      errors.push({
        field: "name",
        message: "Must be between 2 and 80 characters",
      });
    } else {
      const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!slug) {
        errors.push({
          field: "name",
          message: "Must contain at least one English letter or number",
        });
      } else {
        input.name = name.trim();
        input.slug = slug;
      }
    }
  }

  if (!partial || description !== undefined) {
    if (
      description !== undefined &&
      (typeof description !== "string" || description.trim().length > 500)
    ) {
      errors.push({
        field: "description",
        message: "Must be a string of at most 500 characters",
      });
    } else {
      input.description = description?.trim() ?? "";
    }
  }

  return { input, errors };
}

export async function listCategories(_req, res, next) {
  try {
    const categories = await categoryModel.find().sort({ name: 1 }).lean();
    return res.json({ categories });
  } catch (error) {
    return next(error);
  }
}

export async function createCategory(req, res, next) {
  const { input, errors } = validateCategoryInput(req.body ?? {});
  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }
  try {
    const category = await categoryModel.create(input);
    return res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    return next(error);
  }
}

export async function updateCategory(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.categoryId)) {
    return res.status(400).json({ message: "Category ID is invalid" });
  }
  const { input, errors } = validateCategoryInput(req.body ?? {}, true);
  if (errors.length > 0 || Object.keys(input).length === 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors:
        errors.length > 0
          ? errors
          : [{ field: "body", message: "Provide at least one category field" }],
    });
  }
  try {
    const category = await categoryModel.findByIdAndUpdate(
      req.params.categoryId,
      { $set: input },
      { new: true, runValidators: true },
    );
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    return next(error);
  }
}

export async function deleteCategory(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.categoryId)) {
    return res.status(400).json({ message: "Category ID is invalid" });
  }
  try {
    const inUse = await courseModel.exists({ category: req.params.categoryId });
    if (inUse) {
      return res
        .status(409)
        .json({ message: "Category is assigned to one or more courses" });
    }
    const category = await categoryModel.findByIdAndDelete(
      req.params.categoryId,
    );
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

export { validateCategoryInput };
