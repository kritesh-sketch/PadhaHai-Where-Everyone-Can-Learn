/**
 * @file Category controller.
 * Handles listing, retrieving, creating, updating, and deleting course categories.
 */

import mongoose from "mongoose";
import courseModel from "../courses/course.model.js";
import categoryModel, { CATEGORY_STATUSES } from "./category.model.js";
import { slugify as createSlug } from "../../utils/slugify.js";
import { getExploreCategories as findExploreCategories } from "./category.service.js";

/**
 * @typedef {Object} FieldError
 * @property {string} field   Name of the invalid request field.
 * @property {string} message Human-readable validation message.
 */

/**
 * @typedef {Object} CategoryInput
 * @property {string} [name]
 * @property {string} [slug]
 * @property {string} [description]
 * @property {"ACTIVE"|"INACTIVE"} [status]
 * @property {boolean} [isFeatured]
 */

/**
 * Validates and sanitizes a category request body.
 *
 * When `partial` is false (create), `name` is required and a slug is generated
 * from it unless one is provided. When `partial` is true (update), only the
 * fields present in the body are validated and returned.
 *
 * @param {Object} body              Raw request body.
 * @param {boolean} [partial=false]  Whether to validate as a partial update.
 * @returns {{ input: CategoryInput, errors: FieldError[] }}
 *   Sanitized fields ready to persist, and any validation errors found.
 */
function validateCategoryInput(body, partial = false) {
  const input = {}; // sanitized values that are safe to save
  const errors = []; // collected so the client sees all problems at once
  const name = body.name;

  /*
   * Name is required on create. On update it is optional,
   * but if it is sent it must pass the same checks.
   */
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
      const slug = createSlug(name);

      // A name made only of symbols or non-English characters gives an empty slug
      if (!slug) {
        errors.push({
          field: "name",
          message: "Must contain at least one English letter or number",
        });
      } else {
        input.name = name.trim();

        // Auto-generate the slug on create only, and only if no custom slug was sent.
        // On update, renaming keeps the old slug so existing URLs don't break.
        if (!partial && body.slug === undefined) {
          input.slug = slug;
        }
      }
    }
  }

  /*
   * A custom slug is normalized with createSlug (not just checked), so
   * "My Slug!" is saved as "my-slug". It is rejected only if nothing
   * valid remains or the result is longer than 100 characters.
   */
  if (body.slug !== undefined) {
    if (
      typeof body.slug !== "string" ||
      createSlug(body.slug).length === 0 ||
      createSlug(body.slug).length > 100
    ) {
      errors.push({
        field: "slug",
        message:
          "Must contain 1 to 100 letters or numbers separated by hyphens",
      });
    } else {
      input.slug = createSlug(body.slug);
    }
  }

  // Description: always set on create (defaults to ""), optional on update
  if (body.description !== undefined || !partial) {
    if (
      body.description !== undefined &&
      (typeof body.description !== "string" ||
        body.description.trim().length > 500)
    ) {
      errors.push({
        field: "description",
        message: "Must be a string of at most 500 characters",
      });
    } else {
      input.description = body.description?.trim() ?? "";
    }
  }

  // Status must be one of the allowed values (ACTIVE / INACTIVE)
  if (body.status !== undefined) {
    if (!CATEGORY_STATUSES.includes(body.status)) {
      errors.push({
        field: "status",
        message: `Must be one of: ${CATEGORY_STATUSES.join(", ")}`,
      });
    } else {
      input.status = body.status;
    }
  }

  // Optional text fields and their maximum lengths (same limits as the model)
  const textFields = {
    image: 2048,
    icon: 100,
    metaTitle: 160,
    metaDescription: 300,
  };
  for (const [field, max] of Object.entries(textFields)) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].trim().length > max) {
        errors.push({
          field,
          message: `Must be a string of at most ${max} characters`,
        });
      } else {
        input[field] = body[field].trim();
      }
    }
  }

  if (body.isFeatured !== undefined) {
    if (typeof body.isFeatured !== "boolean") {
      errors.push({
        field: "isFeatured",
        message: "Must be a boolean",
      });
    } else {
      input.isFeatured = body.isFeatured;
    }
  }

  // Display order: whole number, 0 or higher
  if (body.displayOrder !== undefined) {
    if (!Number.isInteger(body.displayOrder) || body.displayOrder < 0) {
      errors.push({
        field: "displayOrder",
        message: "Must be a non-negative integer",
      });
    } else {
      input.displayOrder = body.displayOrder;
    }
  }

  // Parent category: a valid ID, or null for a top-level category.
  // Whether the parent actually exists is checked in the controller (needs the database).
  if (body.parentCategory !== undefined) {
    if (
      body.parentCategory !== null &&
      !mongoose.isValidObjectId(body.parentCategory)
    ) {
      errors.push({
        field: "parentCategory",
        message: "Parent category ID is invalid",
      });
    } else {
      input.parentCategory = body.parentCategory;
    }
  }

  return { input, errors };
  1;
}

/**
 * Get active homepage categories that have published courses.
 *
 * @route GET /api/categories/explore
 * @access Public
 */
export async function getExploreCategories(req, res, next) {
  try {
    const categories = await findExploreCategories();
    return res.status(200).json({
      success: true,
      message: "Explore categories retrieved successfully.",
      data: categories,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * List categories.
 *
 * Public users receive only ACTIVE categories. Admins receive all categories
 * and may filter with the optional `status` query parameter.
 *
 * @route   GET /api/categories
 * @access  Public (extended results for ADMIN)
 * @param {import("express").Request} req   Query: `status` (admin only).
 * @param {import("express").Response} res  200 `{ categories }`, 400 on invalid status.
 * @param {import("express").NextFunction} next Forwards unexpected errors.
 * @returns {Promise<void>}
 */
export async function listCategories(req, res, next) {
  const isAdmin = req.user?.role === "ADMIN"; // req.user is empty on public requests
  const status = req.query.status;

  // Only admins can filter by status, so only validate it for them
  if (isAdmin && status !== undefined && !CATEGORY_STATUSES.includes(status)) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        {
          field: "status",
          message: `Must be one of: ${CATEGORY_STATUSES.join(", ")}`,
        },
      ],
    });
  }

  // Documents without a status are treated as ACTIVE (legacy data)
  const activeCategoriesQuery = {
    $or: [{ status: "ACTIVE" }, { status: { $exists: false } }],
  };

  // Optional hierarchy filter: ?parent=<id> for subcategories, ?parent=null for top-level
  const parent = req.query.parent;
  if (
    parent !== undefined &&
    parent !== "null" &&
    !mongoose.isValidObjectId(parent)
  ) {
    return res.status(400).json({
      message: "Validation failed",
      errors: [
        { field: "parent", message: "Must be a valid category ID or 'null'" },
      ],
    });
  }

  /*
   * Build the query based on who is asking:
   * - public user       -> ACTIVE categories only
   * - admin, "ACTIVE"   -> ACTIVE categories only
   * - admin, any status -> that status only
   * - admin, no status  -> everything
   */
  const statusQuery = !isAdmin
    ? activeCategoriesQuery
    : status === "ACTIVE"
      ? activeCategoriesQuery
      : status
        ? { status }
        : {};

  const query = { ...statusQuery };
  if (parent !== undefined) {
    query.parentCategory = parent === "null" ? null : parent;
  }

  try {
    // lean() returns plain objects, which is faster for read-only responses
    const categories = await categoryModel.find(query).sort({ name: 1 }).lean();
    return res.json({ categories });
  } catch (error) {
    return next(error); // handled by the global error middleware
  }
}

/**
 * Get a single category by its slug.
 *
 * @route   GET /api/categories/slug/:slug
 * @access  Public (extended access for ADMIN)
 */
export async function getCategoryBySlug(req, res, next) {
  const isAdmin = req.user?.role === "ADMIN";

  const query = isAdmin
    ? { slug: req.params.slug }
    : {
        slug: req.params.slug,
        $or: [{ status: "ACTIVE" }, { status: { $exists: false } }],
      };

  try {
    const category = await categoryModel.findOne(query).lean();
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ category });
  } catch (error) {
    return next(error);
  }
}

/**
 * Get a single category by its ID.
 *
 * Public users can only retrieve ACTIVE categories; admins can retrieve any.
 *
 * @route   GET /api/categories/:categoryId
 * @access  Public (extended access for ADMIN)
 * @param {import("express").Request} req   Params: `categoryId`.
 * @param {import("express").Response} res  200 `{ category }`, 400 invalid ID, 404 not found.
 * @param {import("express").NextFunction} next Forwards unexpected errors.
 * @returns {Promise<void>}
 */
export async function getCategoryById(req, res, next) {
  // Reject malformed IDs early to avoid a Mongoose CastError
  if (!mongoose.isValidObjectId(req.params.categoryId)) {
    return res.status(400).json({ message: "Category ID is invalid" });
  }

  const isAdmin = req.user?.role === "ADMIN";

  // Non-admins get a 404 for inactive categories, so their existence is not revealed
  const query = isAdmin
    ? { _id: req.params.categoryId }
    : {
        _id: req.params.categoryId,
        $or: [{ status: "ACTIVE" }, { status: { $exists: false } }],
      };

  try {
    const category = await categoryModel.findOne(query).lean();
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    return res.json({ category });
  } catch (error) {
    return next(error);
  }
}

/**
 * Checks that a parent category is allowed (one level of nesting only).
 * @param {string|null} parentId  Requested parent, or null for top-level.
 * @param {string|null} [selfId]  ID of the category being updated (null on create).
 * @returns {Promise<string|null>} Error message, or null if valid.
 */
async function validateParent(parentId, selfId = null) {
  if (parentId === null) return null; // top-level is always allowed

  if (selfId && String(parentId) === String(selfId)) {
    return "A category cannot be its own parent";
  }

  const parent = await categoryModel.findById(parentId).lean();
  if (!parent || parent.status !== "ACTIVE") {
    return "Parent category not found or inactive";
  }
  if (parent.parentCategory) {
    return "Subcategories cannot have subcategories";
  }

  // Updating: a category that already has children cannot become a child itself
  if (selfId && (await categoryModel.exists({ parentCategory: selfId }))) {
    return "A category with subcategories cannot have a parent";
  }

  return null;
}

/**
 * Create a new category.
 *
 * @route   POST /api/categories
 * @access  Private (ADMIN)
 * @param {import("express").Request} req   Body: `name` (required), `slug`, `description`, `status`.
 * @param {import("express").Response} res  201 `{ category }`, 400 validation failed,
 *                                          409 duplicate name or slug.
 * @param {import("express").NextFunction} next Forwards unexpected errors.
 * @returns {Promise<void>}
 */
export async function createCategory(req, res, next) {
  // `?? {}` prevents a crash when the request has no body
  const { input, errors } = validateCategoryInput(req.body ?? {});

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    if (input.parentCategory !== undefined) {
      const parentError = await validateParent(input.parentCategory);
      if (parentError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: [{ field: "parentCategory", message: parentError }],
        });
      }
    }

    const category = await categoryModel.create({
      ...input,
      createdBy: req.user.id,
    });

    return res.status(201).json({ category });
  } catch (error) {
    // 11000 = MongoDB duplicate key (unique name or slug)
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    return next(error);
  }
}

/**
 * Update an existing category. Only the provided fields are changed.
 *
 * @route   PATCH /api/categories/:categoryId
 * @access  Private (ADMIN)
 * @param {import("express").Request} req   Params: `categoryId`.
 *                                          Body: any of `name`, `slug`, `description`, `status`.
 * @param {import("express").Response} res  200 `{ category }`, 400 invalid ID or body,
 *                                          404 not found, 409 duplicate name or slug.
 * @param {import("express").NextFunction} next Forwards unexpected errors.
 * @returns {Promise<void>}
 */
export async function updateCategory(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.categoryId)) {
    return res.status(400).json({ message: "Category ID is invalid" });
  }

  // `true` = partial mode: only validate fields that were actually sent
  const { input, errors } = validateCategoryInput(req.body ?? {}, true);

  // An empty body is also an error, because there would be nothing to update
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
    if (input.parentCategory !== undefined) {
      const parentError = await validateParent(
        input.parentCategory,
        req.params.categoryId,
      );
      if (parentError) {
        return res.status(400).json({
          message: "Validation failed",
          errors: [{ field: "parentCategory", message: parentError }],
        });
      }
    }

    /*
     * $set changes only the given fields.
     * new: true            -> return the updated document
     * runValidators: true  -> apply schema rules to update queries as well
     *                         (they are skipped by default)
     */
    const category = await categoryModel.findByIdAndUpdate(
      req.params.categoryId,
      { $set: { ...input, updatedBy: req.user.id } },
      { new: true, runValidators: true },
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.json({ category });
  } catch (error) {
    // Renaming or re-slugging into an existing value
    if (error.code === 11000) {
      return res.status(409).json({ message: "Category already exists" });
    }
    return next(error);
  }
}

/**
 * Permanently delete a category.
 *
 * Deletion is blocked while any course is still assigned to the category.
 *
 * @route   DELETE /api/categories/:categoryId
 * @access  Private (ADMIN)
 * @param {import("express").Request} req   Params: `categoryId`.
 * @param {import("express").Response} res  204 on success, 400 invalid ID, 404 not found,
 *                                          409 category is assigned to courses.
 * @param {import("express").NextFunction} next Forwards unexpected errors.
 * @returns {Promise<void>}
 */
export async function deleteCategory(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.categoryId)) {
    return res.status(400).json({ message: "Category ID is invalid" });
  }
  try {
    /*
     * Referential integrity check: courses point to a category by ID,
     * so deleting a category that is still in use would leave those
     * courses with a broken reference.
     */
    const hasSubcategories = await categoryModel.exists({
      parentCategory: req.params.categoryId,
    });
    if (hasSubcategories) {
      return res
        .status(409)
        .json({ message: "Category has one or more subcategories" });
    }

    const inUse = await courseModel.exists({ category: req.params.categoryId });
    if (inUse) {
      return res
        .status(409)
        .json({ message: "Category is assigned to one or more courses" });
    }

    const deletedCategory = await categoryModel.findByIdAndDelete(
      req.params.categoryId,
    );
    if (!deletedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // 204 No Content: success, nothing to send back
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

// Exported separately so it can be reused and unit tested on its own
export { validateCategoryInput };
