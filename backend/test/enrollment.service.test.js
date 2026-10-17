import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import courseModel from "../src/modules/courses/course.model.js";
import enrollmentModel from "../src/modules/enrollments/enrollment.model.js";
import lessonModel from "../src/modules/lessons/lesson.model.js";
import progressModel from "../src/modules/progress/progress.model.js";
import {
  completeLesson,
  enrollLearner,
  EnrollmentError,
  getLearnerEnrollmentStatus,
  listCourseEnrollments,
  listLearnerEnrollments,
  setEnrollmentSuspension,
  updateEnrollmentAccess,
  withdrawEnrollment,
} from "../src/modules/enrollments/enrollment.service.js";

function courseQuery(course) {
  return {
    select() {
      return this;
    },
    async lean() {
      return course;
    },
  };
}

function queryChain(value) {
  return {
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function enrollmentRecord(fields = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    status: "ACTIVE",
    completedAt: null,
    withdrawnAt: null,
    suspendedAt: null,
    ...fields,
  };
}

test("enrollment service derives identity from a learner and reactivates withdrawn rows", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const learner = { _id: learnerId, role: "LEARNER", status: "ACTIVE" };
  const course = { _id: courseId, enrollmentOpen: true, visibility: "PUBLIC" };
  let stored = null;

  courseModel.findOne = () => courseQuery(course);
  enrollmentModel.findOne = async () => stored;
  enrollmentModel.create = async (fields) => {
    stored = enrollmentRecord(fields);
    return stored;
  };
  enrollmentModel.findOneAndUpdate = async (_query, update) => {
    Object.assign(stored, update.$set);
    return stored;
  };

  const first = await enrollLearner(learner, courseId);
  assert.equal(first.created, true);
  assert.equal(first.enrollment.status, "ACTIVE");
  assert.equal(first.enrollment.learner, learnerId);
  assert.equal(first.enrollment.course, courseId);

  const repeated = await enrollLearner(learner, courseId);
  assert.equal(repeated.created, false);
  assert.equal(repeated.enrollment._id, first.enrollment._id);

  stored.status = "WITHDRAWN";
  stored.withdrawnAt = new Date();
  const reactivated = await enrollLearner(learner, courseId);
  assert.equal(reactivated.created, false);
  assert.equal(reactivated.reactivated, true);
  assert.equal(reactivated.enrollment._id, first.enrollment._id);
  assert.equal(reactivated.enrollment.status, "ACTIVE");
  assert.equal(reactivated.enrollment.withdrawnAt, null);
});

test("enrollment service rejects non-learners, unavailable courses, and suspended rows", async () => {
  await assert.rejects(
    enrollLearner(
      { _id: new mongoose.Types.ObjectId(), role: "INSTRUCTOR", status: "ACTIVE" },
      new mongoose.Types.ObjectId(),
    ),
    (error) => error instanceof EnrollmentError && error.statusCode === 403,
  );

  const learner = {
    _id: new mongoose.Types.ObjectId(),
    role: "LEARNER",
    status: "ACTIVE",
  };
  const courseId = new mongoose.Types.ObjectId();
  courseModel.findOne = () => courseQuery(null);
  await assert.rejects(
    enrollLearner(learner, courseId),
    (error) => error instanceof EnrollmentError && error.statusCode === 404,
  );

  courseModel.findOne = () =>
    courseQuery({ _id: courseId, enrollmentOpen: true, visibility: "PUBLIC" });
  enrollmentModel.findOne = async () => enrollmentRecord({ status: "SUSPENDED" });
  await assert.rejects(
    enrollLearner(learner, courseId),
    (error) => error instanceof EnrollmentError && error.statusCode === 409,
  );
});

test("enrollment service lists only the authenticated learner and permits active withdrawal", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const learner = { _id: learnerId, role: "LEARNER", status: "ACTIVE" };
  const records = [enrollmentRecord({ learner: learnerId })];
  let update;

  enrollmentModel.find = (query) => {
    assert.equal(query.learner, learnerId);
    return queryChain(records);
  };
  enrollmentModel.countDocuments = async () => records.length;
  const listed = await listLearnerEnrollments(learner);
  assert.equal(listed.enrollments, records);
  assert.equal(listed.pagination.total, 1);

  enrollmentModel.findOneAndUpdate = async (query, values) => {
    assert.equal(query.learner, learnerId);
    assert.equal(query.status, "ACTIVE");
    update = values.$set;
    return { ...records[0], ...update };
  };
  const withdrawn = await withdrawEnrollment(learner, records[0]._id);
  assert.equal(withdrawn.status, "WITHDRAWN");
  assert.ok(update.withdrawnAt instanceof Date);
});

test("course progress is computed from published lesson records and completes server-side", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const lessonId = new mongoose.Types.ObjectId();
  const enrollment = enrollmentRecord({
    learner: learnerId,
    course: courseId,
  });
  courseModel.findOne = () => courseQuery({ _id: courseId });
  lessonModel.findOne = () => courseQuery({ _id: lessonId });
  enrollmentModel.findOne = async () => enrollment;
  progressModel.updateOne = async (_filter, update, options) => {
    assert.ok(update.$setOnInsert.completedAt instanceof Date);
    assert.equal(options.upsert, true);
  };
  progressModel.aggregate = async () => [{ count: 2 }];
  lessonModel.countDocuments = async () => 2;
  enrollmentModel.findOneAndUpdate = async (filter, update) => {
    if (filter.status && typeof filter.status === "object") {
      assert.deepEqual(filter.status.$in, ["ACTIVE", "COMPLETED"]);
    } else {
      assert.equal(filter.status, "ACTIVE");
      assert.equal(update.$set.status, "COMPLETED");
    }
    Object.assign(enrollment, update.$set);
    return enrollment;
  };

  const result = await completeLesson(
    { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
    courseId,
    lessonId,
  );
  assert.equal(result.enrollment.status, "COMPLETED");
  assert.ok(result.enrollment.completedAt instanceof Date);
  assert.deepEqual(result.progress, {
    completedLessons: 2,
    totalLessons: 2,
    percentage: 100,
  });

  const retry = await completeLesson(
    { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
    courseId,
    lessonId,
  );
  assert.equal(retry.enrollment.status, "COMPLETED");
  assert.equal(retry.enrollment.completedAt, result.enrollment.completedAt);
});

test("course enrollment status and roster enforce availability and ownership", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const instructorId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const course = {
    _id: courseId,
    instructor: instructorId,
    enrollmentOpen: true,
    visibility: "PUBLIC",
    maxStudents: 10,
  };
  courseModel.findOne = () => courseQuery(course);
  enrollmentModel.findOne = async () => null;
  enrollmentModel.countDocuments = async () => 9;
  const eligibility = await getLearnerEnrollmentStatus(
    { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
    courseId,
  );
  assert.equal(eligibility.canEnroll, true);
  courseModel.findOne = (filter) =>
    courseQuery(filter.instructor ? null : course);

  await assert.rejects(
    listCourseEnrollments(
      { _id: new mongoose.Types.ObjectId(), role: "INSTRUCTOR" },
      courseId,
    ),
    (error) => error instanceof EnrollmentError && error.statusCode === 404,
  );
  await assert.rejects(
    listCourseEnrollments(
      { _id: learnerId, role: "LEARNER" },
      courseId,
    ),
    (error) => error instanceof EnrollmentError && error.statusCode === 403,
  );
});

test("opening a published lesson updates the learner's continue-learning checkpoint", async () => {
  const learnerId = new mongoose.Types.ObjectId();
  const courseId = new mongoose.Types.ObjectId();
  const lessonId = new mongoose.Types.ObjectId();
  const enrollment = enrollmentRecord({ learner: learnerId, course: courseId });
  courseModel.findOne = () => courseQuery({ _id: courseId });
  lessonModel.findOne = () =>
    courseQuery({ _id: lessonId, title: "Published lesson" });
  enrollmentModel.findOne = async () => enrollment;
  enrollmentModel.findOneAndUpdate = async (filter, update) => {
    assert.deepEqual(filter.status.$in, ["ACTIVE", "COMPLETED"]);
    Object.assign(enrollment, update.$set);
    return enrollment;
  };

  const result = await updateEnrollmentAccess(
    { _id: learnerId, role: "LEARNER", status: "ACTIVE" },
    courseId,
    lessonId,
  );
  assert.equal(result.enrollment.lastAccessedLesson, lessonId);
  assert.ok(result.enrollment.lastAccessedAt instanceof Date);
  assert.equal(result.lesson.title, "Published lesson");
});

test("only administrators can suspend and reactivate enrollments", async () => {
  const enrollment = enrollmentRecord();
  const admin = {
    _id: new mongoose.Types.ObjectId(),
    role: "ADMIN",
  };
  enrollmentModel.findById = async () => enrollment;
  enrollmentModel.findOneAndUpdate = async (_query, update) => {
    Object.assign(enrollment, update.$set);
    return enrollment;
  };

  const suspended = await setEnrollmentSuspension(
    admin,
    enrollment._id,
    "SUSPENDED",
  );
  assert.equal(suspended.status, "SUSPENDED");
  assert.ok(suspended.suspendedAt instanceof Date);
  assert.equal(suspended.suspendedBy, admin._id);

  const active = await setEnrollmentSuspension(
    admin,
    enrollment._id,
    "ACTIVE",
  );
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.suspendedAt, null);
  assert.equal(active.suspendedBy, null);
});

test("enrollment rejects unavailable and full courses", async () => {
  const learner = {
    _id: new mongoose.Types.ObjectId(),
    role: "LEARNER",
    status: "ACTIVE",
  };
  const courseId = new mongoose.Types.ObjectId();
  enrollmentModel.findOne = async () => null;
  courseModel.findOne = () =>
    courseQuery({
      _id: courseId,
      enrollmentOpen: false,
      visibility: "PUBLIC",
    });
  await assert.rejects(
    enrollLearner(learner, courseId),
    (error) => error instanceof EnrollmentError && error.statusCode === 409,
  );

  courseModel.findOne = () =>
    courseQuery({
      _id: courseId,
      enrollmentOpen: true,
      visibility: "PRIVATE",
    });
  await assert.rejects(
    enrollLearner(learner, courseId),
    (error) => error instanceof EnrollmentError && error.statusCode === 409,
  );

  courseModel.findOne = () =>
    courseQuery({
      _id: courseId,
      enrollmentOpen: true,
      visibility: "PUBLIC",
      maxStudents: 1,
    });
  enrollmentModel.countDocuments = async () => 1;
  await assert.rejects(
    enrollLearner(learner, courseId),
    (error) => error instanceof EnrollmentError && error.statusCode === 409,
  );
});
