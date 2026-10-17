import categoryModel from "./category.model.js";
import courseModel from "../courses/course.model.js";

const EXPLORE_CATEGORIES_LIMIT = 8;

/**
 * Return active categories with published courses, ranked for the homepage.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getExploreCategories() {
  return categoryModel.aggregate([
    { $match: { status: "ACTIVE" } },
    {
      $lookup: {
        from: courseModel.collection.name,
        localField: "_id",
        foreignField: "category",
        pipeline: [{ $match: { status: "PUBLISHED" } }, { $count: "count" }],
        as: "publishedCourseStats",
      },
    },
    {
      $addFields: {
        publishedCourseCount: {
          $ifNull: [{ $arrayElemAt: ["$publishedCourseStats.count", 0] }, 0],
        },
      },
    },
    { $match: { publishedCourseCount: { $gt: 0 } } },
    {
      $sort: {
        isFeatured: -1,
        displayOrder: 1,
        publishedCourseCount: -1,
        name: 1,
      },
    },
    { $limit: EXPLORE_CATEGORIES_LIMIT },
    {
      $project: {
        _id: 1,
        name: 1,
        slug: 1,
        description: { $ifNull: ["$description", ""] },
        icon: { $ifNull: ["$icon", ""] },
        image: { $ifNull: ["$image", ""] },
        publishedCourseCount: 1,
      },
    },
  ]);
}