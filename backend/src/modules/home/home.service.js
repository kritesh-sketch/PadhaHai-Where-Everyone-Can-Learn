import Course from "../courses/course.model.js";
import Enrollment from "../enrollments/enrollment.model.js";

const MIN_POPULAR_COURSES = 8;
const MAX_POPULAR_COURSES = 20;

export class RecommendationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "RecommendationError";
    this.statusCode = statusCode;
  }
}

/**
 * Calculate how relevant a course is to a learner.
 * Each signal is scored independently so the weights can be tuned.
 */
function calculateRecommendationScore(course, learner) {
  let score = 0;

  const interests = (learner.interests ?? []).map((item) =>
    String(item).toLowerCase(),
  );

  const goals = (learner.learningGoals ?? []).map((item) =>
    String(item).toLowerCase(),
  );

  const category = String(
    course.category?.name ?? course.category ?? "",
  ).toLowerCase();

  const tags = (course.tags ?? []).map((tag) => String(tag).toLowerCase());

  // Match the course topic against the learner's interests.
  if (
    interests.includes(category) ||
    tags.some((tag) => interests.includes(tag))
  ) {
    score += 30;
  }

  // Match the course against the learner's learning goals.
  const searchableText = [course.title, course.description, category, ...tags]
    .join(" ")
    .toLowerCase();

  if (goals.some((goal) => searchableText.includes(goal))) {
    score += 20;
  }

  // Prefer the learner's current skill level.
  if (learner.preferredLevel && course.level === learner.preferredLevel) {
    score += 15;
  }

  // Course quality: ratings are normalized to a 10-point scale.
  const rating = Number(course.averageRating ?? 0);
  score += Math.max(0, Math.min(rating / 5, 1)) * 15;

  // Popularity is a secondary signal, not the main ranking factor.
  const enrollments = Number(course.enrollmentCount ?? 0);
  score += Math.min(Math.log1p(enrollments) / Math.log1p(1000), 1) * 10;

  // Small discovery bonus for introducing other relevant courses.
  score += 5;

  return Math.round(score * 100) / 100;
}

//Return personalized course recommendations for a learner.
export async function getRecommendedCourses(learner, query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || 8, 1),
    20,
  );

  // Retrieve published courses only.
  const courses = await Course.find({
    status: "PUBLISHED",
  })
    .populate("category", "name")
    .lean();

  // Find courses in which the learner is already enrolled.
  const enrollments = await Enrollment.find({
    learner: learner._id,
  })
    .select("course")
    .lean();

  const enrolledCourseIds = new Set(
    enrollments.map((item) => String(item.course)),
  );

  // Remove enrolled courses and score the remaining candidates.
  const rankedCourses = courses
    .filter((course) => !enrolledCourseIds.has(String(course._id)))
    .map((course) => ({
      ...course,
      recommendationScore: calculateRecommendationScore(course, learner),
    }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore);

  return {
    courses: rankedCourses.slice(0, limit),
    pagination: {
      limit,
      hasMore: rankedCourses.length > limit,
    },
  };
}

export async function getPopularCourses(query = {}) {
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || 8, 1),
    MAX_POPULAR_COURSES,
  );
  const fetchLimit = Math.max(limit, MIN_POPULAR_COURSES);

  const courses = await Course.aggregate([
    { $match: { status: "PUBLISHED" } },
    {
      $lookup: {
        from: Enrollment.collection.name,
        let: { courseId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$course", "$$courseId"] },
              status: "ACTIVE",
            },
          },
          { $count: "count" },
        ],
        as: "enrollmentStats",
      },
    },
    {
      $addFields: {
        enrollmentCount: {
          $ifNull: [{ $arrayElemAt: ["$enrollmentStats.count", 0] }, 0],
        },
      },
    },
    { $project: { enrollmentStats: 0 } },
    { $sort: { enrollmentCount: -1, createdAt: -1, _id: 1 } },
    { $limit: fetchLimit },
  ]);

  if (courses.length < MIN_POPULAR_COURSES) {
    return { courses: [], showSection: false };
  }

  await Course.populate(courses, [
    { path: "category", select: "name slug" },
    { path: "instructor", select: "firstName lastName username" },
  ]);

  return {
    courses: courses.slice(0, limit),
    showSection: true,
  };
}
