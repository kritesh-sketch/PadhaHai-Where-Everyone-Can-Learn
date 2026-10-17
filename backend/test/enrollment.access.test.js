import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import courseModel from "../src/modules/courses/course.model.js";
import { deleteInstructorCourse } from "../src/modules/courses/course.controller.js";
import enrollmentModel from "../src/modules/enrollments/enrollment.model.js";
import lessonModel from "../src/modules/lessons/lesson.model.js";
import {
  deleteLesson,
  listPublishedLessons,
} from "../src/modules/lessons/lesson.controller.js";

function query(value) {
  return {
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("published lesson content requires an active or completed enrollment", async () => {
  const courseId = new mongoose.Types.ObjectId();
  const learnerId = new mongoose.Types.ObjectId();
  courseModel.findOne = () => query({ _id: courseId });
  enrollmentModel.exists = async () => false;
  lessonModel.find = () => {
    throw new Error("Lessons must not be queried without access");
  };

  const deniedResponse = response();
  await listPublishedLessons(
    { params: { courseId: courseId.toString() }, user: { _id: learnerId } },
    deniedResponse,
    (error) => {
      throw error;
    },
  );
  assert.equal(deniedResponse.statusCode, 403);
  assert.deepEqual(deniedResponse.body, {
    message: "An active enrollment is required",
  });

  const lessons = [{ _id: new mongoose.Types.ObjectId(), title: "Lesson" }];
  enrollmentModel.exists = async (filter) => {
    assert.deepEqual(filter.status.$in, ["ACTIVE", "COMPLETED"]);
    assert.equal(filter.course, courseId.toString());
    assert.equal(filter.learner, learnerId);
    return true;
  };
  lessonModel.find = () => ({
    sort() {
      return this;
    },
    async lean() {
      return lessons;
    },
  });

  const allowedResponse = response();
  await listPublishedLessons(
    { params: { courseId: courseId.toString() }, user: { _id: learnerId } },
    allowedResponse,
    (error) => {
      throw error;
    },
  );
  assert.equal(allowedResponse.statusCode, 200);
  assert.deepEqual(allowedResponse.body, { lessons });
});

test("an enrolled course cannot be hard-deleted by its instructor", async () => {
  const courseId = new mongoose.Types.ObjectId();
  courseModel.exists = async () => true;
  courseModel.findOneAndDelete = async () => {
    throw new Error("Enrolled course must not be deleted");
  };
  enrollmentModel.exists = async (query) => {
    assert.equal(query.course, courseId.toString());
    return true;
  };

  const result = response();
  await deleteInstructorCourse(
    {
      params: { courseId: courseId.toString() },
      user: { _id: new mongoose.Types.ObjectId() },
    },
    result,
    (error) => {
      throw error;
    },
  );
  assert.equal(result.statusCode, 409);
  assert.equal(
    result.body.message,
    "Courses with enrollments cannot be deleted; archive the course instead",
  );
});

test("deleting a lesson clears enrollment continue-learning checkpoints", async () => {
  const courseId = new mongoose.Types.ObjectId();
  const lessonId = new mongoose.Types.ObjectId();
  courseModel.exists = async () => true;
  lessonModel.findOneAndDelete = async () => ({ _id: lessonId });
  enrollmentModel.updateMany = async (query, update) => {
    assert.equal(query.lastAccessedLesson, lessonId);
    assert.deepEqual(update.$set, {
      lastAccessedLesson: null,
      lastAccessedAt: null,
    });
    return { modifiedCount: 1 };
  };

  const result = response();
  await deleteLesson(
    {
      params: {
        courseId: courseId.toString(),
        lessonId: lessonId.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId() },
    },
    result,
    (error) => {
      throw error;
    },
  );
  assert.equal(result.statusCode, 204);
});
