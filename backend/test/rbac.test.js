import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
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
] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/config.js"),
  import("../src/modules/users/user.model.js"),
  import("../src/modules/auth/session.model.js"),
  import("../src/modules/courses/course.model.js"),
  import("../src/modules/categories/category.model.js"),
  import("../src/modules/lessons/lesson.model.js"),
]);

const users = new Map();
const sessions = new Map();
const courses = new Map();
const categories = new Map();
const lessons = new Map();
let server;
let baseUrl;

function id(value) {
  return value?._id?.toString() ?? value?.toString();
}

function matches(document, query = {}) {
  return Object.entries(query).every(([field, value]) => {
    if (value && typeof value === "object" && "$in" in value) {
      return value.$in.includes(document[field]);
    }
    return id(document[field]) === id(value);
  });
}

function chain(value) {
  return {
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    select() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function installModelStubs() {
  userModel.findById = async (userId) => users.get(id(userId)) ?? null;
  userModel.find = () =>
    chain([...users.values()].map(({ password: _password, ...user }) => user));
  userModel.findByIdAndUpdate = (userId, update) => {
    const user = users.get(id(userId));
    if (user) {
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
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categories.set(id(category), category);
    return category;
  };
  categoryModel.find = () => chain([...categories.values()]);
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
    createdAt: new Date(),
    updatedAt: new Date(),
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
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("role-specific route matrix enforces authentication before authorization", async () => {
  const unauthenticated = await request("/api/student/dashboard");
  assert.equal(unauthenticated.response.status, 401);

  const student = await createPrincipal("STUDENT");
  const instructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");

  for (const [role, principal] of [
    ["STUDENT", student],
    ["INSTRUCTOR", instructor],
    ["ADMIN", admin],
  ]) {
    const result = await request("/api/student/dashboard", {
      token: principal.token,
    });
    assert.equal(
      result.response.status,
      role === "STUDENT" ? 200 : 403,
      `${role} student dashboard access`,
    );
  }

  for (const [role, principal] of [
    ["STUDENT", student],
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
    ["STUDENT", student],
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
  const student = await createPrincipal("STUDENT");
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
  const student = await createPrincipal("STUDENT");

  const created = await request("/api/instructor/courses", {
    method: "POST",
    token: owner.token,
    body: {
      title: "Owned course",
      description: "A sufficiently long course description.",
      instructor: id(otherInstructor.user),
      status: "PUBLISHED",
    },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.course.instructor, id(owner.user));
  assert.equal(created.body.course.status, "DRAFT");
  const courseId = id(created.body.course);

  const ownerUpdate = await request(`/api/instructor/courses/${courseId}`, {
    method: "PATCH",
    token: owner.token,
    body: { title: "Updated owned course" },
  });
  assert.equal(ownerUpdate.response.status, 200);

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

test("instructors manage lessons on owned courses and admins moderate lesson publication", async () => {
  const owner = await createPrincipal("INSTRUCTOR");
  const otherInstructor = await createPrincipal("INSTRUCTOR");
  const admin = await createPrincipal("ADMIN");
  const student = await createPrincipal("STUDENT");

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
  assert.equal(studentCanReadPublished.response.status, 200);
  assert.equal(studentCanReadPublished.body.lessons.length, 1);

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
  const student = await createPrincipal("STUDENT");
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
    body: { name: "Web Development", description: "Web courses" },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.category.slug, "web-development");

  const update = await request(
    `/api/admin/categories/${id(created.body.category)}`,
    {
      method: "PATCH",
      token: admin.token,
      body: { description: "Frontend and backend web courses" },
    },
  );
  assert.equal(update.response.status, 200);

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
  const student = await createPrincipal("STUDENT");
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
