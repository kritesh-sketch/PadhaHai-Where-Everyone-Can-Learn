import enrollmentModel from "../enrollments/enrollment.model.js";
import courseModel from "../courses/course.model.js";
import lessonModel from "../lessons/lesson.model.js";
import progressModel from "./progress.model.js";
import userModel from "../users/user.model.js";

export class ProgressError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "ProgressError";
    this.statusCode = statusCode;
  }
}

function requireLearner(user) {
  if (!user || user.role !== "LEARNER") {
    throw new ProgressError(403, "Only learners can view their progress");
  }
  if (user.isActive === false || user.status !== "ACTIVE") {
    throw new ProgressError(403, "Learner account is unavailable");
  }
}

function buildLearningProgressSummaryPipeline(learnerId) {
  return [
    {
      $match: {
        learner: learnerId,
        status: { $in: ["ACTIVE", "COMPLETED"] },
      },
    },
    {
      $lookup: {
        from: courseModel.collection.name,
        localField: "course",
        foreignField: "_id",
        pipeline: [{ $match: { status: "PUBLISHED" } }],
        as: "course",
      },
    },
    { $unwind: "$course" },
    {
      $lookup: {
        from: lessonModel.collection.name,
        let: { courseId: "$course._id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$course", "$$courseId"] },
              status: "PUBLISHED",
            },
          },
          { $count: "count" },
        ],
        as: "lessonCounts",
      },
    },
    {
      $lookup: {
        from: progressModel.collection.name,
        let: { courseId: "$course._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$learner", learnerId] },
                  { $eq: ["$course", "$$courseId"] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: lessonModel.collection.name,
              let: { lessonId: "$lesson", courseId: "$course" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", "$$lessonId"] },
                        { $eq: ["$course", "$$courseId"] },
                        { $eq: ["$status", "PUBLISHED"] },
                      ],
                    },
                  },
                },
                { $project: { _id: 1 } },
              ],
              as: "publishedLesson",
            },
          },
          { $match: { "publishedLesson.0": { $exists: true } } },
          { $count: "count" },
        ],
        as: "completedCounts",
      },
    },
    {
      $addFields: {
        totalLessons: {
          $ifNull: [{ $arrayElemAt: ["$lessonCounts.count", 0] }, 0],
        },
        completedLessons: {
          $ifNull: [{ $arrayElemAt: ["$completedCounts.count", 0] }, 0],
        },
      },
    },
    {
      $group: {
        _id: null,
        activeCourses: {
          $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
        },
        completedCourses: {
          $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] },
        },
        totalLessons: { $sum: "$totalLessons" },
        completedLessons: { $sum: "$completedLessons" },
      },
    },
    {
      $project: {
        _id: 0,
        activeCourses: 1,
        completedCourses: 1,
        totalLessons: 1,
        completedLessons: 1,
      },
    },
  ];
}

export async function getLearningProgressSummary(user) {
  requireLearner(user);

  const [summary] = await enrollmentModel.aggregate(
    buildLearningProgressSummaryPipeline(user._id),
  );
  const totalLessons = summary?.totalLessons ?? 0;
  const completedLessons = summary?.completedLessons ?? 0;

  return {
    activeCourses: summary?.activeCourses ?? 0,
    completedCourses: summary?.completedCourses ?? 0,
    completedLessons,
    totalLessons,
    progressPercentage:
      totalLessons === 0
        ? 0
        : Math.min(100, Math.round((completedLessons / totalLessons) * 100)),
  };
}

function buildContinueLearningPipeline(learnerId, page, limit) {
  return [
    { $match: { learner: learnerId, status: "ACTIVE" } },
    {
      $lookup: {
        from: courseModel.collection.name,
        localField: "course",
        foreignField: "_id",
        as: "course",
      },
    },
    { $unwind: "$course" },
    { $match: { "course.status": "PUBLISHED" } },
    {
      $lookup: {
        from: userModel.collection.name,
        localField: "course.instructor",
        foreignField: "_id",
        pipeline: [{ $project: { firstName: 1, lastName: 1, username: 1 } }],
        as: "instructor",
      },
    },
    {
      $unwind: {
        path: "$instructor",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: lessonModel.collection.name,
        let: { lessonId: "$lastAccessedLesson", courseId: "$course._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$lessonId"] },
                  { $eq: ["$course", "$$courseId"] },
                  { $eq: ["$status", "PUBLISHED"] },
                ],
              },
            },
          },
          { $project: { title: 1, position: 1 } },
        ],
        as: "currentLesson",
      },
    },
    {
      $lookup: {
        from: lessonModel.collection.name,
        let: { courseId: "$course._id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$course", "$$courseId"] },
              status: "PUBLISHED",
            },
          },
          { $count: "count" },
        ],
        as: "lessonCounts",
      },
    },
    {
      $lookup: {
        from: progressModel.collection.name,
        let: { courseId: "$course._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$learner", learnerId] },
                  { $eq: ["$course", "$$courseId"] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: lessonModel.collection.name,
              let: { lessonId: "$lesson", courseId: "$course" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", "$$lessonId"] },
                        { $eq: ["$course", "$$courseId"] },
                        { $eq: ["$status", "PUBLISHED"] },
                      ],
                    },
                  },
                },
                { $project: { _id: 1 } },
              ],
              as: "publishedLesson",
            },
          },
          { $match: { "publishedLesson.0": { $exists: true } } },
          { $count: "count" },
        ],
        as: "completedCounts",
      },
    },
    {
      $addFields: {
        totalLessons: {
          $ifNull: [{ $arrayElemAt: ["$lessonCounts.count", 0] }, 0],
        },
        completedLessons: {
          $ifNull: [{ $arrayElemAt: ["$completedCounts.count", 0] }, 0],
        },
      },
    },
    {
      $match: {
        $or: [
          { lastAccessedAt: { $ne: null } },
          { completedLessons: { $gt: 0 } },
        ],
      },
    },
    { $sort: { lastAccessedAt: -1, _id: 1 } },
    {
      $facet: {
        courses: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 0,
              enrollmentId: "$_id",
              courseId: "$course._id",
              courseTitle: "$course.title",
              thumbnail: "$course.thumbnail",
              instructor: 1,
              totalLessons: 1,
              completedLessons: 1,
              lastAccessedAt: 1,
              currentLesson: {
                $ifNull: [{ $arrayElemAt: ["$currentLesson", 0] }, null],
              },
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    },
  ];
}

export async function listContinueLearning(user, pagination) {
  requireLearner(user);

  const [result = { courses: [], total: [] }] = await enrollmentModel.aggregate(
    buildContinueLearningPipeline(
      user._id,
      pagination.page,
      pagination.limit,
    ),
  );
  const total = result.total[0]?.count ?? 0;

  return {
    courses: result.courses.map((course) => {
      const currentLesson = course.currentLesson
        ? {
            id: course.currentLesson._id,
            title: course.currentLesson.title,
            position: course.currentLesson.position,
          }
        : null;

      return {
        enrollmentId: course.enrollmentId,
        courseId: course.courseId,
        courseTitle: course.courseTitle,
        thumbnail: course.thumbnail,
        instructorName: course.instructor
          ? `${course.instructor.firstName} ${course.instructor.lastName}`.trim()
          : "",
        totalLessons: course.totalLessons,
        completedLessons: course.completedLessons,
        progressPercentage:
          course.totalLessons === 0
            ? 0
            : Math.min(
                100,
                Math.round(
                  (course.completedLessons / course.totalLessons) * 100,
                ),
              ),
        lastAccessedAt: course.lastAccessedAt,
        currentLesson,
        resumeUrl: currentLesson
          ? `/api/student/courses/${course.courseId}/lessons/${currentLesson.id}`
          : null,
      };
    }),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    },
  };
}
