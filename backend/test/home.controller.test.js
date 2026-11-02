import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import categoryModel from "../src/modules/categories/category.model.js";
import courseModel from "../src/modules/courses/course.model.js";
import enrollmentModel from "../src/modules/enrollments/enrollment.model.js";
import { getHome } from "../src/modules/home/home.controller.js";
import { getPopularCourses } from "../src/modules/home/home.service.js";

test("home response includes continue-learning courses and pagination", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const lessonId = new mongoose.Types.ObjectId();
  const enrollmentId = new mongoose.Types.ObjectId();
  const originalCategoryAggregate = categoryModel.aggregate;
  const originalCourseAggregate = courseModel.aggregate;
  const originalCoursePopulate = courseModel.populate;
  const originalCourseFind = courseModel.find;
  const originalEnrollmentFind = enrollmentModel.find;
  const originalEnrollmentAggregate = enrollmentModel.aggregate;
  const categories = [{ _id: new mongoose.Types.ObjectId(), name: "Science" }];
  let response;

  categoryModel.aggregate = async () => categories;
  courseModel.aggregate = async () =>
    Array.from({ length: 8 }, (_, index) => ({
      _id: new mongoose.Types.ObjectId(),
      title: `Popular course ${index + 1}`,
      enrollmentCount: 8 - index,
    }));
  courseModel.populate = async (courses) => courses;
  courseModel.find = () => ({
    populate() {
      return this;
    },
    lean: async () => [],
  });
  enrollmentModel.find = () => ({
    select() {
      return this;
    },
    lean: async () => [],
  });
  enrollmentModel.aggregate = async (pipeline) => {
    if (pipeline.some((stage) => stage.$facet)) {
      const paginationStages = pipeline.find((stage) => stage.$facet).$facet
        .courses;
      assert.equal(paginationStages[0].$skip, 0);
      assert.equal(paginationStages[1].$limit, 5);
      return [
        {
          courses: [
            {
              enrollmentId,
              courseId,
              courseTitle: "Learning Science",
              thumbnail: "science.png",
              instructor: { firstName: "Ada", lastName: "Lovelace" },
              totalLessons: 4,
              completedLessons: 1,
              lastAccessedAt: new Date("2026-10-12T12:00:00.000Z"),
              currentLesson: {
                _id: lessonId,
                title: "First principles",
                position: 2,
              },
            },
          ],
          total: [{ count: 1 }],
        },
      ];
    }

    assert.deepEqual(pipeline[0].$match, {
      learner: learnerId,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    });
    return [
      {
        activeCourses: 2,
        completedCourses: 1,
        completedLessons: 5,
        totalLessons: 10,
      },
    ];
  };

  try {
    const res = {
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(body) {
        response = body;
        return this;
      },
    };
    await getHome(
      {
        user: { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
        query: {},
        continueLearningPagination: { page: 1, limit: 5 },
      },
      res,
      (error) => {
        throw error;
      },
    );

    assert.equal(res.statusCode, 200);
    assert.equal(response.data.continueLearning.length, 1);
    assert.deepEqual(response.data.learningProgress, {
      activeCourses: 2,
      completedCourses: 1,
      completedLessons: 5,
      totalLessons: 10,
      progressPercentage: 50,
    });
    assert.equal(
      response.data.continueLearning[0].courseTitle,
      "Learning Science",
    );
    assert.equal(response.data.popularCourses.length, 8);
    assert.equal(response.data.showPopularCourses, true);
    assert.deepEqual(response.data.categories, categories);
    assert.deepEqual(response.pagination.continueLearning, {
      page: 1,
      limit: 5,
      total: 1,
      totalPages: 1,
    });
    assert.deepEqual(response.pagination.recommendedCourses, {
      limit: 8,
      hasMore: false,
    });
  } finally {
    categoryModel.aggregate = originalCategoryAggregate;
    courseModel.aggregate = originalCourseAggregate;
    courseModel.populate = originalCoursePopulate;
    courseModel.find = originalCourseFind;
    enrollmentModel.find = originalEnrollmentFind;
    enrollmentModel.aggregate = originalEnrollmentAggregate;
  }
});

test("popular courses are hidden when fewer than eight published courses exist", async () => {
  const originalCourseAggregate = courseModel.aggregate;
  const originalCoursePopulate = courseModel.populate;
  let requestedLimit;
  courseModel.aggregate = async (pipeline) => {
    requestedLimit = pipeline.at(-1).$limit;
    return Array.from({ length: 7 }, () => ({}));
  };
  courseModel.populate = async (courses) => courses;

  try {
    const result = await getPopularCourses({ limit: "3" });
    assert.equal(requestedLimit, 8);
    assert.deepEqual(result, { courses: [], showSection: false });
  } finally {
    courseModel.aggregate = originalCourseAggregate;
    courseModel.populate = originalCoursePopulate;
  }
});
