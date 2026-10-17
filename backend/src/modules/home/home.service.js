import Course from "../courses/course.model.js";
import Enrollment from "../enrollments/enrollment.model.js";

const MIN_TRENDING_COURSES = 8;
const MAX_TRENDING_COURSES = 20;

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

/**
 * Retrieves the most popular published courses for the trending section.
 *
 * Ranks courses by enrollment count, using creation date as a secondary
 * sorting criterion. Populates category and instructor details and hides
 * the trending section when fewer than the required minimum courses exist.
 *
 * @param {Object} req - The request object containing the optional result limit.
 * @param {Object} res - The response object used to return trending courses and section visibility.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The trending course response or the result of error forwarding.
 */
export async function popularCourses(req, res, next) {
  try {
    // Default to 8 courses and constrain the requested limit to 1–20.
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      20,
    );

    // Always fetch at least 8 courses to check section visibility.
    const fetchLimit = Math.max(limit, MIN_TRENDING_COURSES);

    // Retrieve published courses and calculate active enrollment counts.
    const courses = await courseModel.aggregate([
      // Include only publicly published courses.
      {
        $match: {
          status: "PUBLISHED",
        },
      },

      // Join enrollment records for each course.
      {
        $lookup: {
          from: enrollmentModel.collection.name,
          let: { courseId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$course", "$$courseId"],
                },
                status: "ACTIVE",
              },
            },
            {
              $count: "count",
            },
          ],
          as: "enrollmentStats",
        },
      },

      // Extract the enrollment count, defaulting to zero.
      {
        $addFields: {
          enrollmentCount: {
            $ifNull: [
              {
                $arrayElemAt: ["$enrollmentStats.count", 0],
              },
              0,
            ],
          },
        },
      },

      // Remove temporary aggregation data.
      {
        $project: {
          enrollmentStats: 0,
        },
      },

      // Rank by active enrollments, then newest courses.
      {
        $sort: {
          enrollmentCount: -1,
          createdAt: -1,
          _id: 1,
        },
      },

      // Fetch enough courses to evaluate section visibility.
      {
        $limit: fetchLimit,
      },
    ]);

    // Hide the section if fewer than 8 published courses exist.
    if (courses.length < MIN_TRENDING_COURSES) {
      return res.status(200).json({
        courses: [],
        showSection: false,
      });
    }

    // Populate category and instructor details.
    await courseModel.populate(courses, [
      {
        path: "category",
        select: "name slug",
      },
      {
        path: "instructor",
        select: "firstName lastName username",
      },
    ]);

    // Return only the requested number of courses.
    return res.status(200).json({
      courses: courses.slice(0, limit),
      showSection: true,
    });
  } catch (error) {
    return next(error);
  }
}

// Courses selected for homepage promotion
export async function listContinueLearning(req, res, next) {}
