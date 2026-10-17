import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test } from "node:test";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import sessionModel from "../src/modules/auth/session.model.js";
import userModel from "../src/modules/users/user.model.js";
import {
  changeMyPassword,
  getMyProfile,
  updateMyInterests,
  updateMyProfile,
  UserServiceError,
} from "../src/modules/users/user.service.js";

const users = new Map();
let revokedSessions;

function id(value) {
  return value?._id?.toString() ?? value?.toString();
}

function makeUser(role, fields = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    role,
    firstName: "Test",
    lastName: "User",
    location: { country: "Nepal", city: "Kathmandu" },
    socialLinks: { github: "https://github.com/test" },
    notificationPreferences: { email: true, courseUpdates: true },
    ...fields,
    set(path, value) {
      const [parent, child] = path.split(".");
      if (child) {
        this[parent] = { ...(this[parent] ?? {}), [child]: value };
      } else {
        this[parent] = value;
      }
    },
    async save() {
      users.set(id(this), this);
      return this;
    },
  };
}

beforeEach(() => {
  users.clear();
  revokedSessions = 0;
  userModel.findById = (userId) => {
    const query = Promise.resolve(users.get(id(userId)) ?? null);
    query.select = () => query;
    return query;
  };
  sessionModel.updateMany = async () => {
    revokedSessions += 1;
    return { modifiedCount: 1 };
  };
});

test("getMyProfile returns role profile data without credentials or security fields", async () => {
  const user = makeUser("LEARNER", {
    password: "secret-hash",
    passwordResetTokenHash: "secret-token-hash",
    failedLoginAttempts: 4,
    interests: ["design"],
  });
  users.set(id(user), user);

  const profile = await getMyProfile(user._id);

  assert.equal(profile.role, "LEARNER");
  assert.deepEqual(profile.interests, ["design"]);
  assert.equal("password" in profile, false);
  assert.equal("passwordResetTokenHash" in profile, false);
  assert.equal("failedLoginAttempts" in profile, false);
});

test("instructor profiles include application status but not reviewer identity", async () => {
  const reviewerId = new mongoose.Types.ObjectId();
  const user = makeUser("INSTRUCTOR", {
    instructorStatus: "APPROVED",
    instructorVerifiedBy: reviewerId,
  });
  users.set(id(user), user);

  const profile = await getMyProfile(user._id);

  assert.equal(profile.instructorStatus, "APPROVED");
  assert.equal("instructorVerifiedBy" in profile, false);
});

test("profile services return a standardized not-found error for missing users", async () => {
  const absentUserId = new mongoose.Types.ObjectId();

  await assert.rejects(
    getMyProfile(absentUserId),
    (error) =>
      error instanceof UserServiceError &&
      error.statusCode === 404 &&
      error.message === "User not found",
  );
  await assert.rejects(
    updateMyProfile(absentUserId, { firstName: "Missing" }),
    (error) => error instanceof UserServiceError && error.statusCode === 404,
  );
});

test("updateMyProfile permits learner and instructor fields and safely merges nested objects", async () => {
  const learner = makeUser("LEARNER");
  const instructor = makeUser("INSTRUCTOR");
  users.set(id(learner), learner);
  users.set(id(instructor), instructor);

  await updateMyProfile(learner._id, {
    educationLevel: "BACHELORS",
    interests: ["Data science", "data science"],
    location: { city: "Pokhara" },
    socialLinks: { linkedin: "https://linkedin.com/in/test" },
  });
  await updateMyProfile(instructor._id, {
    currentPosition: "Instructor",
    skills: ["Teaching"],
    yearsOfExperience: 3,
  });

  assert.deepEqual(learner.location, {
    country: "Nepal",
    city: "Pokhara",
  });
  assert.deepEqual(learner.socialLinks, {
    github: "https://github.com/test",
    linkedin: "https://linkedin.com/in/test",
  });
  assert.deepEqual(learner.interests, ["Data science"]);
  assert.equal(instructor.currentPosition, "Instructor");
  assert.deepEqual(instructor.skills, ["Teaching"]);
});

test("profile updates reject protected and role-inappropriate fields", async () => {
  const learner = makeUser("LEARNER");
  const instructor = makeUser("INSTRUCTOR");
  const admin = makeUser("ADMIN");
  for (const user of [learner, instructor, admin]) users.set(id(user), user);

  for (const protectedField of ["email", "username", "role", "status", "password"]) {
    await assert.rejects(
      updateMyProfile(learner._id, { [protectedField]: "changed" }),
      (error) => error instanceof UserServiceError && error.statusCode === 400,
    );
  }
  await assert.rejects(
    updateMyProfile(learner._id, { currentPosition: "Not allowed" }),
    (error) => error instanceof UserServiceError && error.statusCode === 400,
  );
  await assert.rejects(
    updateMyProfile(instructor._id, { educationLevel: "BACHELORS" }),
    (error) => error instanceof UserServiceError && error.statusCode === 400,
  );

  const adminProfile = await updateMyProfile(admin._id, {
    headline: "Administrator",
  });
  assert.equal(adminProfile.headline, "Administrator");
  await assert.rejects(
    updateMyProfile(admin._id, { interests: ["restricted"] }),
    (error) => error instanceof UserServiceError && error.statusCode === 400,
  );
});

test("updateMyInterests is learner-only, validates values, and deduplicates case-insensitively", async () => {
  const learner = makeUser("LEARNER");
  const instructor = makeUser("INSTRUCTOR");
  users.set(id(learner), learner);
  users.set(id(instructor), instructor);

  const updated = await updateMyInterests(learner._id, [
    "  Design ",
    "design",
    "Programming",
  ]);

  assert.deepEqual(updated.interests, ["Design", "Programming"]);
  await assert.rejects(
    updateMyInterests(instructor._id, ["Design"]),
    (error) => error instanceof UserServiceError && error.statusCode === 403,
  );
  await assert.rejects(
    updateMyInterests(learner._id, [""]),
    (error) => error instanceof UserServiceError && error.statusCode === 400,
  );
});

test("changeMyPassword verifies the current password, hashes the replacement, and revokes sessions", async () => {
  const user = makeUser("LEARNER", {
    password: await bcrypt.hash("securePass123", 4),
  });
  users.set(id(user), user);

  const result = await changeMyPassword(
    user._id,
    "securePass123",
    "anotherSecurePass456",
  );

  assert.match(result.message, /sign in again/);
  assert.equal(await bcrypt.compare("anotherSecurePass456", user.password), true);
  assert.equal(revokedSessions, 1);
  await assert.rejects(
    changeMyPassword(user._id, "wrong-password", "anotherSecurePass789"),
    (error) => error instanceof UserServiceError && error.statusCode === 400,
  );
  assert.equal(revokedSessions, 1);
});

test("changeMyPassword accepts an existing legacy SHA-256 password hash", async () => {
  const user = makeUser("LEARNER", {
    password: createHash("sha256").update("legacyPass123").digest("hex"),
  });
  users.set(id(user), user);

  await changeMyPassword(user._id, "legacyPass123", "newSecurePass456");

  assert.equal(await bcrypt.compare("newSecurePass456", user.password), true);
  assert.equal(revokedSessions, 1);
});
