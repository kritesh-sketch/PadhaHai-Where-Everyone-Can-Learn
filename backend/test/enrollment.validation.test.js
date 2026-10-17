import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseAdministrativeStatusInput,
  parseEnrollmentListQuery,
  validateCourseId,
  validateEmptyEnrollmentBody,
  validateEnrollmentId,
} from "../src/modules/enrollments/enrollment.validation.js";

test("enrollment query validation bounds pagination and accepts known statuses", () => {
  assert.deepEqual(parseEnrollmentListQuery({ page: "2", limit: "10", status: "ACTIVE" }), {
    page: 2,
    limit: 10,
    status: "ACTIVE",
    errors: [],
  });
  assert.equal(parseEnrollmentListQuery({ page: "0" }).errors[0].field, "page");
  assert.equal(parseEnrollmentListQuery({ limit: "101" }).errors[0].field, "limit");
  assert.equal(
    parseEnrollmentListQuery({ status: "PENDING" }).errors[0].field,
    "status",
  );
});

test("enrollment input validation rejects client-controlled identity and status", () => {
  assert.equal(validateEmptyEnrollmentBody(), true);
  assert.equal(validateEmptyEnrollmentBody({}), true);
  assert.equal(
    validateEmptyEnrollmentBody({
      learner: "someone-else",
      status: "COMPLETED",
    }),
    false,
  );
  assert.equal(
    parseAdministrativeStatusInput({ status: "COMPLETED" }).errors.length,
    1,
  );
  assert.equal(
    parseAdministrativeStatusInput({
      status: "SUSPENDED",
      suspendedBy: "attacker",
    }).errors.length,
    1,
  );
  assert.equal(
    parseAdministrativeStatusInput({ status: "SUSPENDED" }).errors.length,
    0,
  );
  assert.equal(validateCourseId("invalid"), false);
  assert.equal(validateEnrollmentId("invalid"), false);
});
