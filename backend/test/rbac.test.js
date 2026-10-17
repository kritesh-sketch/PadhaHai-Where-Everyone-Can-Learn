import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

process.env.JWT_SECRET = "rbac-test-secret-that-is-not-used-outside-tests";
process.env.MONGODB_URL = "mongodb://127.0.0.1/rbac-tests";

const [
  { default: app },
  { default: config },
  { default: userModel },
  { default: sessionModel },
  { default: courseModel },
  { default: categoryModel },
  { default: lessonModel },
  { default: enrollmentModel },
  { default: progressModel },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/config.js"),
  import("../src/modules/users/user.model.js"),
  import("../src/modules/auth/session.model.js"),
  import("../src/modules/courses/course.model.js"),
  import("../src/modules/categories/category.model.js"),
  import("../src/modules/lessons/lesson.model.js"),
  import("../src/modules/enrollments/enrollment.model.js"),
  import("../src/modules/progress/progress.model.js"),
]);

const users = new Map();
const sessions = new Map();
const courses = new Map();
const categories = new Map();
const lessons = new Map();
const enrollments = new Map();
let server;
let baseUrl;

function id(value) {
  return value?._id?.toString() ?? value?.toString();
}

function matches(document, query = {}) {
  return Object.entries(query).every(([field, value]) => {
    if (field === "$or") {
      return value.some((condition) => matches(document, condition));
    }
    if (field === "$and") {
      return value.every((condition) => matches(document, condition));
    }
    if (value instanceof RegExp) {
      return value.test(document[field] ?? "");
    }
    if (value instanceof RegExp) {
      return value.test(document[field] ?? "");
    }
    if (value && typeof value === "object" && "$in" in value) {
      return value.$in.some((item) => id(item) === id(document[field]));
    }
    if (value && typeof value === "object" && "$exists" in value) {
      return (document[field] !== undefined) === value.$exists;
    }
    return id(document[field]) === id(value);
  });
}

function chain(value) {
  let results = value;
  return {
    populate() {
      return this;
    },
    sort(sortFields = {}) {
      const [[field, direction]] = Object.entries(sortFields);
      if (field) {
        results = [...results].sort((left, right) => {
          const leftValue = left[field] ?? "";
          const rightValue = right[field] ?? "";
          if (leftValue < rightValue) return -1 * direction;
          if (leftValue > rightValue) return direction;
          return 0;
        });
      }
      return this;
    },
    skip(count) {
      results = results.slice(count);
      return this;
    },
    limit(count) {
      results = results.slice(0, count);
      return this;
    },
    select() {
      return this;
    },
    async lean() {
      return results;
    },
  };
}

function installModelStubs() {
  userModel.findOne = (query) => {
    const result = [...users.values()].find((user) => matches(user, query)) ?? null;
    return {
      select() {
        return Promise.resolve(result);
      },
    };
  };
  userModel.findById = (userId) => {
    const result = Promise.resolve(users.get(id(userId)) ?? null);
    result.select = () => result;
    return result;
  };
  userModel.find = (query = {}) =>
    chain(
      [...users.values()]
        .filter((user) => matches(user, query))
        .map(({ password: _password, ...user }) => user),
    );
  userModel.findByIdAndUpdate = (userId, update) => {
    const user = users.get(id(userId));
    if (user) {
      for (const field of ["email", "username"]) {
        if (
          update.$set[field] !== undefined &&
          [...users.values()].some(
            (candidate) =>
              id(candidate) !== id(user) &&
              candidate[field] === update.$set[field],
          )
        ) {
          const error = new Error(`${field} already exists`);
          error.code = 11000;
          error.keyPattern = { [field]: 1 };
          throw error;
        }
      }
      Object.assign(user, update.$set);
    }
    return {
      select() {
        return Promise.resolve(user ?? null);
      },
    };
  };
  userModel.countDocuments = async (query = {}) =>
    [...users.values()].filter((user) => matches(user, query)).length;

  sessionModel.findById = async (sessionId) =>
    sessions.get(id(sessionId)) ?? null;
  sessionModel.create = async (fields) => {
    const session = {
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      revoked: false,
      expiresAt: fields.expiresAt ?? new Date(Date.now() + 60_000),
    };
    sessions.set(id(session), session);
    return session;
  };
  sessionModel.updateMany = async (query, update) => {
    let modifiedCount = 0;
    for (const session of sessions.values()) {
      if (matches(session, query)) {
        Object.assign(session, update.$set);
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  };

  courseModel.create = async (fields) => {
    const course = {
      enrollmentOpen: true,
      visibility: "PUBLIC",
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    courses.set(id(course), course);
    return course;
  };
  courseModel.find = (query) =>
    chain([...courses.values()].filter((course) => matches(course, query)));
  courseModel.findOne = (query) =>
    chain(
      [...courses.values()].find((course) => matches(course, query)) ?? null,
    );
  courseModel.findOneAndUpdate = async (query, update) => {
    const course = [...courses.values()].find((item) => matches(item, query));
    if (course) {
      Object.assign(course, update.$set);
    }
    return course ?? null;
  };
  courseModel.findOneAndDelete = async (query) => {
    const course = [...courses.values()].find((item) => matches(item, query));
    if (course) {
      courses.delete(id(course));
    }
    return course ?? null;
  };
  courseModel.findByIdAndUpdate = async (courseId, update) => {
    const course = courses.get(id(courseId));
    if (course) {
      Object.assign(course, update.$set);
    }
    return course ?? null;
  };
  courseModel.exists = async (query) =>
    [...courses.values()].some((course) => matches(course, query));
  courseModel.countDocuments = async (query = {}) =>
    [...courses.values()].filter((course) => matches(course, query)).length;

  lessonModel.create = async (fields) => {
    const lesson = {
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    lessons.set(id(lesson), lesson);
    return lesson;
  };
  lessonModel.find = (query) =>
    chain([...lessons.values()].filter((lesson) => matches(lesson, query)));
  lessonModel.findOneAndUpdate = async (query, update) => {
    const lesson = [...lessons.values()].find((item) => matches(item, query));
    if (lesson) {
      Object.assign(lesson, update.$set);
    }
    return lesson ?? null;
  };
  lessonModel.findOneAndDelete = async (query) => {
    const lesson = [...lessons.values()].find((item) => matches(item, query));
    if (lesson) {
      lessons.delete(id(lesson));
    }
    return lesson ?? null;
  };
  lessonModel.findByIdAndUpdate = async (lessonId, update) => {
    const lesson = lessons.get(id(lessonId));
    if (lesson) {
      Object.assign(lesson, update.$set);
    }
    return lesson ?? null;
  };
  lessonModel.countDocuments = async (query = {}) =>
    [...lessons.values()].filter((lesson) => matches(lesson, query)).length;

  categoryModel.create = async (fields) => {
    const category = {
      status: "ACTIVE",
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categories.set(id(category), category);
    return category;
  };
  categoryModel.find = (query = {}) =>
    chain([...categories.values()].filter((category) => matches(category, query)));
  categoryModel.exists = async (query) =>
    [...categories.values()].some((category) => matches(category, query));
  categoryModel.findByIdAndUpdate = async (categoryId, update) => {
    const category = categories.get(id(categoryId));
    if (category) {
      Object.assign(category, update.$set);
    }
    return category ?? null;
  };
  categoryModel.findByIdAndDelete = async (categoryId) => {
    const category = categories.get(id(categoryId));
    if (category) {
      categories.delete(id(category));
    }
    return category ?? null;
  };
  categoryModel.countDocuments = async () => categories.size;

  enrollmentModel.create = async (fields) => {
    if (
      [...enrollments.values()].some(
        (item) =>
          id(item.learner) === id(fields.learner) &&
          id(item.course) === id(fields.course),
      )
    ) {
      const error = new Error("Duplicate enrollment");
      error.code = 11000;
      error.keyPattern = { learner: 1, course: 1 };
      throw error;
    }
    const enrollment = {
      completedAt: null,
      withdrawnAt: null,
      suspendedAt: null,
      lastAccessedLesson: null,
      lastAccessedAt: null,
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    enrollments.set(id(enrollment), enrollment);
    return enrollment;
  };
  enrollmentModel.findOne = async (query) =>
    [...enrollments.values()].find((item) => matches(item, query)) ?? null;
  enrollmentModel.findOneAndUpdate = async (query, update) => {
    const enrollment = [...enrollments.values()].find((item) =>
      matches(item, query),
    );
    if (enrollment) {
      Object.assign(enrollment, update.$set, { updatedAt: new Date() });
    }
    return enrollment ?? null;
  };
  enrollmentModel.find = (query = {}) =>
    chain(
      [...enrollments.values()].filter((item) => matches(item, query)),
    );
  enrollmentModel.exists = async (query) =>
    [...enrollments.values()].some((item) => matches(item, query));
  enrollmentModel.updateMany = async (query, update) => {
    let modifiedCount = 0;
    for (const enrollment of enrollments.values()) {
      if (matches(enrollment, query)) {
        Object.assign(enrollment, update.$set);
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  };
  enrollmentModel.countDocuments = async (query = {}) =>
    [...enrollments.values()].filter((item) => matches(item, query)).length;
  progressModel.aggregate = async () => [];
  lessonModel.aggregate = async () => [];
}

async function createPrincipal(role) {
  const user = {
    _id: new mongoose.Types.ObjectId(),
    firstName: role,
    lastName: "Test",
    username: `${role.toLowerCase()}_${users.size}`,
    email: `${role.toLowerCase()}_${users.size}@example.test`,
    role,
    isActive: true,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    async save() {
      users.set(id(this), this);
      return this;
    },
  };
  users.set(id(user), user);

  const session = {
    _id: new mongoose.Types.ObjectId(),
    user: user._id,
    revoked: false,
    expiresAt: new Date(Date.now() + 60_000),
  };
  sessions.set(id(session), session);

  return {
    user,
    token: jwt.sign(
      {
        sub: id(user),
        sessionId: id(session),
        tokenType: "access",
      },
      config.JWT_SECRET,
      { expiresIn: "5m", algorithm: "HS256" },
    ),
  };
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

before(async () => {
  installModelStubs();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  users.clear();
  sessions.clear();
  courses.clear();
  categories.clear();
  lessons.clear();
  enrollments.clear();
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("role-specific route matrix enforces authentication before authorization", async () => {
  const unauthenticated = await request("/api/student/dashboard");
  assert.equal(unauthenticated.response.status, 401);

  const student = await createPrincipal("LEARNER");
  const instructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");

  for (const [role, principal] of [
    ["LEARNER", student],
    ["INSTRUCTOR", instructor],
    ["ADMIN", admin],
  ]) {
    const result = await request("/api/student/dashboard", {
      token: principal.token,
    });
    assert.equal(
      result.response.status,
      role === "LEARNER" ? 200 : 403,
      `${role} student dashboard access`,
    );
  }

  for (const [role, principal] of [
    ["LEARNER", student],
    ["INSTRUCTOR", instructor],
    ["ADMIN", admin],
  ]) {
    const result = await request("/api/instructor/courses", {
      method: "POST",
      token: principal.token,
      body: {
        title: "A useful course",
        description: "A sufficiently long course description.",
      },
    });
    assert.equal(
      result.response.status,
      role === "INSTRUCTOR" ? 201 : 403,
      `${role} instructor API access`,
    );
  }

  for (const [role, principal] of [
    ["LEARNER", student],
    ["INSTRUCTOR", instructor],
    ["ADMIN", admin],
  ]) {
    const result = await request("/api/admin/dashboard", {
      token: principal.token,
    });
    assert.equal(
      result.response.status,
      role === "ADMIN" ? 200 : 403,
      `${role} admin dashboard access`,
    );
  }

  const forgedAdminClaim = jwt.sign(
    {
      sub: id(student.user),
      sessionId: id(
        [...sessions.values()].find(
          (session) => id(session.user) === id(student.user),
        ),
      ),
      role: "ADMIN",
      tokenType: "access",
    },
    config.JWT_SECRET,
    { expiresIn: "5m", algorithm: "HS256" },
  );
  const forgedRole = await request("/api/admin/dashboard", {
    token: forgedAdminClaim,
  });
  assert.equal(forgedRole.response.status, 403);
});

test("students can only browse published courses and cannot call instructor APIs", async () => {
  const instructor = await createPrincipal("INSTRUCTOR");
  const student = await createPrincipal("LEARNER");
  const draft = await request("/api/instructor/courses", {
    method: "POST",
    token: instructor.token,
    body: {
      title: "Draft course",
      description: "A sufficiently long course description.",
    },
  });
  assert.equal(draft.response.status, 201);
  assert.equal(draft.body.course.status, "DRAFT");

  const hiddenDetail = await request(
    `/api/student/courses/${draft.body.course._id}`,
    { token: student.token },
  );
  assert.equal(hiddenDetail.response.status, 404);

  const blockedCreate = await request("/api/instructor/courses", {
    method: "POST",
    token: student.token,
    body: {
      title: "Forbidden course",
      description: "A sufficiently long course description.",
    },
  });
  assert.equal(blockedCreate.response.status, 403);

  const authenticatedCatalog = await request("/api/categories", {
    token: student.token,
  });
  assert.equal(authenticatedCatalog.response.status, 200);
});

test("instructors can manage only their own courses; admins moderate publication", async () => {
  const owner = await createPrincipal("INSTRUCTOR");
  const otherInstructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");
  const student = await createPrincipal("LEARNER");

  const created = await request("/api/instructor/courses", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Owned course",
      description: "A sufficiently long course description.",
      thumbnail: "https://example.test/course.png",
      level: "INTERMEDIATE",
      language: "Hindi",
      instructor: id(otherInstructor.user),
      status: "PUBLISHED",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.course.instructor, id(owner.user));
  assert.equal(created.body.course.status, "DRAFT");
  assert.equal(created.body.course.slug, "owned-course");
  assert.equal(created.body.course.thumbnail, "https://example.test/course.png");
  assert.equal(created.body.course.level, "INTERMEDIATE");
  assert.equal(created.body.course.language, "Hindi");
  const courseId = id(created.body.course);

  const ownerUpdate = await request(`/api/instructor/courses/${courseId}`, {
    method: "PATCH",
    token: owner.token,
    body: { title: "Updated owned course" },
  });
  assert.equal(ownerUpdate.response.status, 200);
  assert.equal(ownerUpdate.body.course.slug, "updated-owned-course");

  const otherUpdate = await request(`/api/instructor/courses/${courseId}`, {
    method: "PATCH",
    token: otherInstructor.token,
    body: { title: "Stolen course" },
  });
  assert.equal(otherUpdate.response.status, 404);

  const otherDelete = await request(`/api/instructor/courses/${courseId}`, {
    method: "DELETE",
    token: otherInstructor.token,
  });
  assert.equal(otherDelete.response.status, 404);

  const blockedModeration = await request(
    `/api/admin/courses/${courseId}/moderation`,
    {
      method: "PATCH",
      token: owner.token,
      body: { status: "PUBLISHED" },
    },
  );
  assert.equal(blockedModeration.response.status, 403);

  const moderationList = await request("/api/admin/courses", {
    token: admin.token,
  });
  assert.equal(moderationList.response.status, 200);
  assert.equal(moderationList.body.courses.length, 1);

  const moderation = await request(
    `/api/admin/courses/${courseId}/moderation`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "PUBLISHED" },
    },
  );
  assert.equal(moderation.response.status, 200);

  const published = await request(`/api/student/courses/${courseId}`, {
    token: student.token,
  });
  assert.equal(published.response.status, 200);
  assert.equal(published.body.course.status, "PUBLISHED");

  const filteredCourses = await request(
    "/api/student/courses?search=owned&level=INTERMEDIATE&language=hindi&sortBy=title&sortOrder=asc&page=1&limit=1",
    { token: student.token },
  );
  assert.equal(filteredCourses.response.status, 200);
  assert.equal(filteredCourses.body.courses.length, 1);
  assert.equal(filteredCourses.body.pagination.total, 1);

  const archived = await request(`/api/instructor/courses/${courseId}/status`, {
    method: "PATCH",
    token: owner.token,
    body: { status: "ARCHIVED" },
  });
  assert.equal(archived.response.status, 200);
  assert.equal(archived.body.course.status, "ARCHIVED");
  const hiddenArchived = await request(`/api/student/courses/${courseId}`, {
    token: student.token,
  });
  assert.equal(hiddenArchived.response.status, 404);

  const republished = await request(
    `/api/admin/courses/${courseId}/moderation`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "PUBLISHED" },
    },
  );
  assert.equal(republished.response.status, 200);

  const changedAfterApproval = await request(
    `/api/instructor/courses/${courseId}`,
    {
      method: "PATCH",
      token: owner.token,
      body: { title: "Updated after approval" },
    },
  );
  assert.equal(changedAfterApproval.response.status, 200);
  assert.equal(changedAfterApproval.body.course.status, "DRAFT");

  const hiddenUntilReapproved = await request(
    `/api/student/courses/${courseId}`,
    { token: student.token },
  );
  assert.equal(hiddenUntilReapproved.response.status, 404);
});

test("learners enroll only themselves, withdraw, and reactivate the same enrollment", async () => {
  const learner = await createPrincipal("LEARNER");
  const otherLearner = await createPrincipal("LEARNER");
  const instructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");
  const createdCourse = await request("/api/instructor/courses", {
    method: "POST",
    token: instructor.token,
    body: {
      title: "Enrollment lifecycle course",
      description: "A sufficiently long course description.",
    },
  });
  const courseId = id(createdCourse.body.course);
  await request(`/api/admin/courses/${courseId}/moderation`, {
    method: "PATCH",
    token: admin.token,
    body: { status: "PUBLISHED" },
  });

  const rejectedBody = await request(
    `/api/student/courses/${courseId}/enrollments`,
    {
      method: "POST",
      token: learner.token,
      body: {
        learner: id(otherLearner.user),
        status: "COMPLETED",
      },
    },
  );
  assert.equal(rejectedBody.response.status, 400);

  const created = await request(
    `/api/student/courses/${courseId}/enrollments`,
    { method: "POST", token: learner.token },
  );
  assert.equal(created.response.status, 201);
  assert.equal(id(created.body.enrollment.learner), id(learner.user));
  assert.equal(created.body.enrollment.status, "ACTIVE");

  const cannotDeleteEnrolledCourse = await request(
    `/api/instructor/courses/${courseId}`,
    { method: "DELETE", token: instructor.token },
  );
  assert.equal(cannotDeleteEnrolledCourse.response.status, 409);

  const duplicate = await request(
    `/api/student/courses/${courseId}/enrollments`,
    { method: "POST", token: learner.token },
  );
  assert.equal(duplicate.response.status, 200);
  assert.equal(id(duplicate.body.enrollment), id(created.body.enrollment));

  const instructorCannotEnroll = await request(
    `/api/student/courses/${courseId}/enrollments`,
    { method: "POST", token: instructor.token },
  );
  assert.equal(instructorCannotEnroll.response.status, 403);

  const withdrawn = await request(
    `/api/student/enrollments/${id(created.body.enrollment)}/withdraw`,
    { method: "PATCH", token: learner.token },
  );
  assert.equal(withdrawn.response.status, 200);
  assert.equal(withdrawn.body.enrollment.status, "WITHDRAWN");
  assert.ok(withdrawn.body.enrollment.withdrawnAt);

  const reactivated = await request(
    `/api/student/courses/${courseId}/enrollments`,
    { method: "POST", token: learner.token },
  );
  assert.equal(reactivated.response.status, 200);
  assert.equal(reactivated.body.reactivated, true);
  assert.equal(id(reactivated.body.enrollment), id(created.body.enrollment));
  assert.equal(reactivated.body.enrollment.status, "ACTIVE");
  assert.equal(reactivated.body.enrollment.withdrawnAt, null);

  const ownEnrollments = await request("/api/student/enrollments", {
    token: learner.token,
  });
  assert.equal(ownEnrollments.response.status, 200);
  assert.equal(ownEnrollments.body.enrollments.length, 1);
  assert.equal(id(ownEnrollments.body.enrollments[0].learner), id(learner.user));

  const otherLearnerEnrollments = await request("/api/student/enrollments", {
    token: otherLearner.token,
  });
  assert.equal(otherLearnerEnrollments.body.enrollments.length, 0);
});

test("instructors manage lessons on owned courses and admins moderate lesson publication", async () => {
  const owner = await createPrincipal("INSTRUCTOR");
  const otherInstructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");
  const student = await createPrincipal("LEARNER");

  const createdCourse = await request("/api/instructor/courses", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Course with lessons",
      description: "A sufficiently long course description.",
    },
  });
  const courseId = id(createdCourse.body.course);

  const lessonResult = await request(
    `/api/instructor/courses/${courseId}/lessons`,
    {
      method: "POST",
      token: owner.token,
      body: {
        title: "Introduction",
        content: "A sufficiently long lesson content.",
        position: 1,
        status: "PUBLISHED",
      },
    },
  );
  assert.equal(lessonResult.response.status, 201);
  assert.equal(lessonResult.body.lesson.status, "DRAFT");
  assert.equal(id(lessonResult.body.lesson.instructor), id(owner.user));

  const foreignCreate = await request(
    `/api/instructor/courses/${courseId}/lessons`,
    {
      method: "POST",
      token: otherInstructor.token,
      body: {
        title: "Foreign lesson",
        content: "A sufficiently long lesson content.",
        position: 1,
      },
    },
  );
  assert.equal(foreignCreate.response.status, 404);

  const foreignUpdate = await request(
    `/api/instructor/courses/${courseId}/lessons/${id(lessonResult.body.lesson)}`,
    {
      method: "PATCH",
      token: otherInstructor.token,
      body: { title: "Unauthorized edit" },
    },
  );
  assert.equal(foreignUpdate.response.status, 404);

  const studentCreate = await request(
    `/api/instructor/courses/${courseId}/lessons`,
    {
      method: "POST",
      token: student.token,
      body: {
        title: "Forbidden lesson",
        content: "A sufficiently long lesson content.",
        position: 2,
      },
    },
  );
  assert.equal(studentCreate.response.status, 403);

  const studentCannotReadDraft = await request(
    `/api/student/courses/${courseId}/lessons`,
    { token: student.token },
  );
  assert.equal(studentCannotReadDraft.response.status, 404);

  const publishedCourse = await request(
    `/api/admin/courses/${courseId}/moderation`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "PUBLISHED" },
    },
  );
  assert.equal(publishedCourse.response.status, 200);

  const publishedLesson = await request(
    `/api/admin/lessons/${id(lessonResult.body.lesson)}/moderation`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "PUBLISHED" },
    },
  );
  assert.equal(publishedLesson.response.status, 200);

  const studentCanReadPublished = await request(
    `/api/student/courses/${courseId}/lessons`,
    { token: student.token },
  );
  assert.equal(studentCanReadPublished.response.status, 403);

  const studentEnrollment = await request(
    `/api/student/courses/${courseId}/enrollments`,
    { method: "POST", token: student.token },
  );
  assert.equal(studentEnrollment.response.status, 201);

  const enrolledStudentCanReadPublished = await request(
    `/api/student/courses/${courseId}/lessons`,
    { token: student.token },
  );
  assert.equal(enrolledStudentCanReadPublished.response.status, 200);
  assert.equal(enrolledStudentCanReadPublished.body.lessons.length, 1);

  const lessonEdit = await request(
    `/api/instructor/courses/${courseId}/lessons/${id(lessonResult.body.lesson)}`,
    {
      method: "PATCH",
      token: owner.token,
      body: { title: "Revised introduction" },
    },
  );
  assert.equal(lessonEdit.response.status, 200);
  assert.equal(lessonEdit.body.lesson.status, "DRAFT");

  const lessonHiddenUntilReapproved = await request(
    `/api/student/courses/${courseId}/lessons`,
    { token: student.token },
  );
  assert.equal(lessonHiddenUntilReapproved.response.status, 200);
  assert.equal(lessonHiddenUntilReapproved.body.lessons.length, 0);

  const adminLessons = await request("/api/admin/lessons", {
    token: admin.token,
  });
  assert.equal(adminLessons.response.status, 200);
  assert.equal(adminLessons.body.lessons.length, 1);
});

test("only admins can manage categories and category deletion protects course references", async () => {
  const student = await createPrincipal("LEARNER");
  const instructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");

  for (const principal of [student, instructor]) {
    const result = await request("/api/admin/categories", {
      method: "POST",
      token: principal.token,
      body: { name: "Security", description: "Security courses" },
    });
    assert.equal(result.response.status, 403);
  }

  const invalidSlug = await request("/api/admin/categories", {
    method: "POST",
    token: admin.token,
    body: { name: "+++ !!!" },
  });
  assert.equal(invalidSlug.response.status, 400);

  const created = await request("/api/admin/categories", {
    method: "POST",
    token: admin.token,
    body: {
      name: "Web Development",
      slug: "frontend-backend",
      description: "Web courses",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.category.slug, "frontend-backend");
  assert.equal(created.body.category.status, "ACTIVE");

  const learnerCategories = await request("/api/categories", {
    token: student.token,
  });
  assert.equal(learnerCategories.response.status, 200);
  assert.equal(learnerCategories.body.categories.length, 1);

  const update = await request(
    `/api/admin/categories/${id(created.body.category)}`,
    {
      method: "PATCH",
      token: admin.token,
      body: {
        description: "Frontend and backend web courses",
        status: "INACTIVE",
      },
    },
  );
  assert.equal(update.response.status, 200);
  assert.equal(update.body.category.status, "INACTIVE");

  const hiddenCategories = await request("/api/categories", {
    token: student.token,
  });
  assert.equal(hiddenCategories.response.status, 200);
  assert.equal(hiddenCategories.body.categories.length, 0);

  const adminCategories = await request("/api/admin/categories", {
    token: admin.token,
  });
  assert.equal(adminCategories.response.status, 200);
  assert.equal(adminCategories.body.categories.length, 1);

  const instructorCourse = await request("/api/instructor/courses", {
    method: "POST",
    token: instructor.token,
    body: {
      title: "Web foundations",
      description: "A sufficiently long course description.",
      category: id(created.body.category),
    },
  });
  assert.equal(instructorCourse.response.status, 201);

  const inUse = await request(
    `/api/admin/categories/${id(created.body.category)}`,
    { method: "DELETE", token: admin.token },
  );
  assert.equal(inUse.response.status, 409);

  const unassigned = await request("/api/admin/categories", {
    method: "POST",
    token: admin.token,
    body: { name: "Unassigned" },
  });
  const deleted = await request(
    `/api/admin/categories/${id(unassigned.body.category)}`,
    { method: "DELETE", token: admin.token },
  );
  assert.equal(deleted.response.status, 204);
});

test("admins manage user roles, deactivate accounts, and receive dashboard counts", async () => {
  const admin = await createPrincipal("ADMIN");
  const student = await createPrincipal("LEARNER");
  const instructor = await createPrincipal("INSTRUCTOR");

  const denied = await request(`/api/admin/users/${id(student.user)}`, {
    method: "PATCH",
    token: instructor.token,
    body: { role: "ADMIN" },
  });
  assert.equal(denied.response.status, 403);

  const promoted = await request(`/api/admin/users/${id(student.user)}`, {
    method: "PATCH",
    token: admin.token,
    body: { role: "INSTRUCTOR" },
  });
  assert.equal(promoted.response.status, 200);
  assert.equal(promoted.body.user.role, "INSTRUCTOR");

  const oldStudentAccess = await request("/api/student/dashboard", {
    token: student.token,
  });
  assert.equal(oldStudentAccess.response.status, 403);

  const newInstructorAccess = await request("/api/instructor/courses", {
    token: student.token,
  });
  assert.equal(newInstructorAccess.response.status, 200);

  const invalidRole = await request(`/api/admin/users/${id(student.user)}`, {
    method: "PATCH",
    token: admin.token,
    body: { role: "SUPERUSER" },
  });
  assert.equal(invalidRole.response.status, 400);

  const deactivated = await request(`/api/admin/users/${id(instructor.user)}`, {
    method: "PATCH",
    token: admin.token,
    body: { isActive: false },
  });
  assert.equal(deactivated.response.status, 200);
  const instructorSession = [...sessions.values()].find(
    (session) => id(session.user) === id(instructor.user),
  );
  assert.equal(instructorSession.revoked, true);

  const blockedAfterDeactivation = await request("/api/instructor/courses", {
    token: instructor.token,
  });
  assert.equal(blockedAfterDeactivation.response.status, 401);

  const dashboard = await request("/api/admin/dashboard", {
    token: admin.token,
  });
  assert.equal(dashboard.response.status, 200);
  assert.equal(dashboard.body.dashboard.users.total, 3);
  assert.equal(dashboard.body.dashboard.users.administrators, 1);
  assert.equal(dashboard.body.dashboard.users.active, 2);
});

test("user profiles and admin user management validate access, updates, and account lifecycle", async () => {
  const learner = await createPrincipal("LEARNER");
  const otherLearner = await createPrincipal("LEARNER");
  const instructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");
  learner.user.password = await bcrypt.hash("securePass123", 4);

  const profile = await request("/api/users/me", { token: learner.token });
  assert.equal(profile.response.status, 200);
  assert.equal(Object.hasOwn(profile.body.user, "password"), false);

  const ownDetails = await request(`/api/users/${id(learner.user)}`, {
    token: learner.token,
  });
  assert.equal(ownDetails.response.status, 200);
  const forbiddenDetails = await request(`/api/users/${id(otherLearner.user)}`, {
    token: learner.token,
  });
  assert.equal(forbiddenDetails.response.status, 403);
  const invalidId = await request("/api/users/not-an-id", {
    token: learner.token,
  });
  assert.equal(invalidId.response.status, 400);
  const missingPicture = await request("/api/users/me/profile-picture", {
    method: "POST",
    token: learner.token,
  });
  assert.equal(missingPicture.response.status, 400);

  const updated = await request("/api/users/me", {
    method: "PATCH",
    token: learner.token,
    body: {
      firstName: "Updated",
      lastName: "Learner",
      phone: "+1 555-0100",
      bio: "Learner profile bio",
    },
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.user.email, learner.user.email);
  assert.equal(updated.body.user.username, learner.user.username);
  assert.equal(updated.body.user.phone, "+1 555-0100");
  assert.equal(Object.hasOwn(updated.body.user, "password"), false);

  const invalidUpdate = await request("/api/users/me", {
    method: "PATCH",
    token: learner.token,
    body: { role: "ADMIN", status: "ACTIVE" },
  });
  assert.equal(invalidUpdate.response.status, 400);
  const duplicateEmail = await request("/api/users/me", {
    method: "PATCH",
    token: learner.token,
    body: { email: otherLearner.user.email },
  });
  assert.equal(duplicateEmail.response.status, 400);
  const duplicateUsername = await request("/api/users/me", {
    method: "PATCH",
    token: learner.token,
    body: { username: otherLearner.user.username },
  });
  assert.equal(duplicateUsername.response.status, 400);

  const userList = await request(
    "/api/admin/users?role=LEARNER&status=ACTIVE&search=Updated&sortBy=name&sortOrder=asc&page=1&limit=1",
    { token: admin.token },
  );
  assert.equal(userList.response.status, 200);
  assert.equal(userList.body.users.length, 1);
  assert.equal(userList.body.pagination.total, 1);
  assert.equal(Object.hasOwn(userList.body.users[0], "password"), false);
  const invalidQuery = await request("/api/admin/users?sortBy=password", {
    token: admin.token,
  });
  assert.equal(invalidQuery.response.status, 400);
  const missingUser = await request(
    `/api/admin/users/${new mongoose.Types.ObjectId()}`,
    { token: admin.token },
  );
  assert.equal(missingUser.response.status, 404);

  const adminUpdate = await request(
    `/api/admin/users/${id(otherLearner.user)}`,
    {
      method: "PATCH",
      token: admin.token,
      body: { firstName: "Admin edited", role: "INSTRUCTOR" },
    },
  );
  assert.equal(adminUpdate.response.status, 200);
  assert.equal(adminUpdate.body.user.firstName, "Admin edited");
  assert.equal(adminUpdate.body.user.role, "INSTRUCTOR");

  const selfAdminStatusChange = await request(
    `/api/admin/users/${id(admin.user)}`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "INACTIVE" },
    },
  );
  assert.equal(selfAdminStatusChange.response.status, 409);
  const selfAdminDeactivation = await request("/api/users/me/status", {
    method: "PATCH",
    token: admin.token,
  });
  assert.equal(selfAdminDeactivation.response.status, 409);

  const selfDeactivation = await request("/api/users/me/status", {
    method: "PATCH",
    token: learner.token,
  });
  assert.equal(selfDeactivation.response.status, 200);
  assert.equal(selfDeactivation.body.user.status, "INACTIVE");
  const deactivatedAccess = await request("/api/users/me", {
    token: learner.token,
  });
  assert.equal(deactivatedAccess.response.status, 401);

  const reactivated = await request("/api/auth/reactivate", {
    method: "POST",
    body: { identifier: learner.user.username, password: "securePass123" },
  });
  assert.equal(reactivated.response.status, 200);
  assert.equal(learner.user.status, "ACTIVE");

  const suspended = await request(
    `/api/admin/users/${id(learner.user)}`,
    {
      method: "PATCH",
      token: admin.token,
      body: { status: "SUSPENDED" },
    },
  );
  assert.equal(suspended.response.status, 200);
  const suspendedReactivation = await request("/api/auth/reactivate", {
    method: "POST",
    body: { identifier: learner.user.username, password: "securePass123" },
  });
  assert.equal(suspendedReactivation.response.status, 403);

  const adminDetails = await request(`/api/admin/users/${id(learner.user)}`, {
    token: admin.token,
  });
  assert.equal(adminDetails.response.status, 200);
  assert.equal(Object.hasOwn(adminDetails.body.user, "password"), false);
  assert.equal(instructor.user.role, "INSTRUCTOR");
});

test("changing a password hashes it and revokes the user's sessions", async () => {
  const learner = await createPrincipal("LEARNER");
  learner.user.password = await bcrypt.hash("securePass123", 4);

  const changed = await request("/api/users/me/password", {
    method: "PATCH",
    token: learner.token,
    body: {
      currentPassword: "securePass123",
      newPassword: "anotherSecurePass456",
    },
  });
  assert.equal(changed.response.status, 200);
  assert.equal(
    await bcrypt.compare("anotherSecurePass456", learner.user.password),
    true,
  );
  assert.equal(
    [...sessions.values()].find((session) => id(session.user) === id(learner.user))
      .revoked,
    true,
  );
  assert.equal(Object.hasOwn(changed.body, "password"), false);
});
