import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import enrollmentModel, {
  ENROLLMENT_STATUSES,
} from "../src/modules/enrollments/enrollment.model.js";

test("enrollment validates required references and allowed status", async () => {
  const missingReferences = new enrollmentModel();
  await assert.rejects(missingReferences.validate(), (error) => {
    assert.ok(error.errors.learner);
    assert.ok(error.errors.course);
    return true;
  });

  const invalidStatus = new enrollmentModel({
    learner: new mongoose.Types.ObjectId(),
    course: new mongoose.Types.ObjectId(),
    status: "PENDING",
  });
  await assert.rejects(invalidStatus.validate(), (error) => {
    assert.ok(error.errors.status);
    return true;
  });

  const invalidReference = new enrollmentModel({
    learner: "not-an-object-id",
    course: new mongoose.Types.ObjectId(),
  });
  await assert.rejects(invalidReference.validate(), (error) => {
    assert.ok(error.errors.learner);
    return true;
  });

  const validEnrollment = new enrollmentModel({
    learner: new mongoose.Types.ObjectId(),
    course: new mongoose.Types.ObjectId(),
  });
  await validEnrollment.validate();
  assert.equal(validEnrollment.status, "ACTIVE");
  assert.deepEqual(ENROLLMENT_STATUSES, [
    "ACTIVE",
    "COMPLETED",
    "WITHDRAWN",
    "SUSPENDED",
  ]);
});

test("enrollment schema uses the existing model references and query indexes", () => {
  const schema = enrollmentModel.schema;
  assert.equal(schema.path("learner").options.ref, "User");
  assert.equal(schema.path("course").options.ref, "Course");
  assert.equal(schema.path("lastAccessedLesson").options.ref, "Lesson");
  assert.equal(schema.options.timestamps, true);

  const indexes = schema.indexes();
  assert.ok(
    indexes.some(
      ([keys, options]) =>
        keys.learner === 1 &&
        keys.course === 1 &&
        options.unique === true,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys]) =>
        keys.learner === 1 && keys.status === 1 && keys.updatedAt === -1,
    ),
  );
  assert.ok(
    indexes.some(
      ([keys]) => keys.course === 1 && keys.status === 1,
    ),
  );
});
