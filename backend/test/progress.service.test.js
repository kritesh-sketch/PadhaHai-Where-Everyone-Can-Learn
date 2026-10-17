import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import enrollmentModel from "../src/modules/enrollments/enrollment.model.js";
import {
  listContinueLearning,
  ProgressError,
} from "../src/modules/progress/progress.service.js";
import { parseContinueLearningQuery } from "../src/modules/progress/progress.validation.js";

test("continue learning returns mapped progress and pagination for the authenticated learner", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const lessonId = new mongoose.Types.ObjectId();
  const enrollmentId = new mongoose.Types.ObjectId();
  const lastAccessedAt = new Date("2026-10-12T12:00:00.000Z");
  const originalAggregate = enrollmentModel.aggregate;

  enrollmentModel.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match, {
      learner: learnerId,
      status: "ACTIVE",
    });
    const pageFacet = pipeline.find((stage) => stage.$facet).$facet;
    assert.equal(pageFacet.courses[0].$skip, 20);
    assert.equal(pageFacet.courses[1].$limit, 10);
    return [
      {
        courses: [
          {
            enrollmentId,
            courseId,
            courseTitle: "Learning MongoDB",
            thumbnail: "https://example.test/course.png",
            instructor: { firstName: "Ada", lastName: "Lovelace" },
            totalLessons: 5,
            completedLessons: 2,
            lastAccessedAt,
            currentLesson: {
              _id: lessonId,
              title: "Aggregation basics",
              position: 3,
            },
          },
        ],
        total: [{ count: 1 }],
      },
    ];
  };

  try {
    const result = await listContinueLearning(
      { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
      { page: 3, limit: 10 },
    );

    assert.deepEqual(result, {
      courses: [
        {
          enrollmentId,
          courseId,
          courseTitle: "Learning MongoDB",
          thumbnail: "https://example.test/course.png",
          instructorName: "Ada Lovelace",
          totalLessons: 5,
          completedLessons: 2,
          progressPercentage: 40,
          lastAccessedAt,
          currentLesson: {
            id: lessonId,
            title: "Aggregation basics",
            position: 3,
          },
          resumeUrl: `/api/student/courses/${courseId}/lessons/${lessonId}`,
        },
      ],
      pagination: { page: 3, limit: 10, total: 1, totalPages: 1 },
    });
  } finally {
    enrollmentModel.aggregate = originalAggregate;
  }
});

test("continue learning returns an empty array and zero pages when no progress exists", async () => {
  const originalAggregate = enrollmentModel.aggregate;
  enrollmentModel.aggregate = async () => [
    { courses: [], total: [] },
  ];

  try {
    const result = await listContinueLearning(
      {
        _id: new mongoose.Types.ObjectId(),
        role: "LEARNER",
        status: "ACTIVE",
      },
      { page: 1, limit: 20 },
    );
    assert.deepEqual(result.courses, []);
    assert.deepEqual(result.pagination, {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  } finally {
    enrollmentModel.aggregate = originalAggregate;
  }
});

test("continue learning is restricted to learners", async () => {
  await assert.rejects(
    listContinueLearning(
      { _id: new mongoose.Types.ObjectId(), role: "INSTRUCTOR", status: "ACTIVE" },
      { page: 1, limit: 20 },
    ),
    (error) => error instanceof ProgressError && error.statusCode === 403,
  );
});

test("continue learning pagination validates positive integers and limits", () => {
  assert.deepEqual(parseContinueLearningQuery({}), {
    page: 1,
    limit: 20,
    errors: [],
  });
  assert.deepEqual(parseContinueLearningQuery({ page: "2", limit: "50" }), {
    page: 2,
    limit: 50,
    errors: [],
  });
  assert.equal(parseContinueLearningQuery({ page: "0" }).errors[0].field, "page");
  assert.equal(
    parseContinueLearningQuery({ limit: "101" }).errors[0].field,
    "limit",
  );
});
