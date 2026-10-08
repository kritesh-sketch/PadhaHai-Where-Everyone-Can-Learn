import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

process.env.JWT_SECRET = "auth-test-secret-that-is-not-used-outside-tests";
process.env.MONGODB_URL = "mongodb://127.0.0.1/auth-tests";

const [
  { default: app },
  { default: config },
  { default: userModel },
  { default: sessionModel },
  { authorizeRoles },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/config.js"),
  import("../src/modules/users/user.model.js"),
  import("../src/modules/auth/session.model.js"),
  import("../src/middleware/role.middleware.js"),
]);

const users = new Map();
const sessions = new Map();
let server;
let baseUrl;

function userById(id) {
  return users.get(id.toString());
}

function sessionById(id) {
  return sessions.get(id.toString());
}

function matchesSession(session, query) {
  return (
    session &&
    (!query.user || session.user.toString() === query.user.toString()) &&
    (!query.refreshTokenHash ||
      session.refreshTokenHash === query.refreshTokenHash) &&
    (query.revoked === undefined || session.revoked === query.revoked) &&
    (!query.expiresAt?.$gt || session.expiresAt > query.expiresAt.$gt)
  );
}

function installModelStubs() {
  userModel.findOne = (query) => {
    let result;
    if (query.$or) {
      result = [...users.values()].find((user) =>
        query.$or.some((condition) =>
          Object.entries(condition).some(
            ([field, value]) => user[field] === value,
          ),
        ),
      );
    } else {
      const [field, value] = Object.entries(query)[0] ?? [];
      result = [...users.values()].find((user) => user[field] === value);
    }

    const pending = Promise.resolve(result ?? null);
    pending.select = async () => result ?? null;
    return pending;
  };
  userModel.create = async (fields) => {
    const user = {
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      async save() {
        users.set(this._id.toString(), this);
        return this;
      },
    };
    users.set(user._id.toString(), user);
    return user;
  };
  userModel.findById = async (id) => userById(id) ?? null;
  userModel.find = () => {
    const query = {
      select() {
        return this;
      },
      limit() {
        return this;
      },
      async lean() {
        return [...users.values()].map(
          ({ password: _password, ...user }) => user,
        );
      },
    };
    return query;
  };

  sessionModel.create = async (fields) => {
    const session = {
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      revoked: false,
      async save() {
        sessions.set(this._id.toString(), this);
        return this;
      },
    };
    sessions.set(session._id.toString(), session);
    return session;
  };
  sessionModel.findOne = async (query) =>
    [...sessions.values()].find((session) => matchesSession(session, query)) ??
    null;
  sessionModel.findById = async (id) => sessionById(id) ?? null;
  sessionModel.findOneAndUpdate = async (query, update) => {
    const session = [...sessions.values()].find((item) =>
      matchesSession(item, query),
    );
    if (session) {
      Object.assign(session, update.$set);
    }
    return session ?? null;
  };
}

async function request(path, { method = "GET", body, token, cookie } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (cookie) {
    headers.cookie = cookie;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const responseBody = await response.json();
  const setCookie = response.headers.getSetCookie?.()[0];
  return { response, body: responseBody, setCookie };
}

function cookieValue(setCookie) {
  return setCookie?.split(";")[0] ?? "";
}

async function register(rolePath, overrides = {}) {
  return request(`/api/auth/register${rolePath}`, {
    method: "POST",
    body: {
      firstName: "Test",
      lastName: "Learner",
      username: "test_learner",
      email: "test@example.com",
      password: "securePass123",
      ...overrides,
    },
  });
}

async function createAuthorizedUser(role) {
  const user = await userModel.create({
    firstName: "Role",
    lastName: "Tester",
    username: `${role.toLowerCase()}_tester`,
    email: `${role.toLowerCase()}@example.com`,
    password: await bcrypt.hash("securePass123", 4),
    role,
    isActive: true,
  });
  const session = await sessionModel.create({
    user: user._id,
    refreshTokenHash: "test-refresh-hash",
    ip: "127.0.0.1",
    userAgent: "auth tests",
    expiresAt: new Date(Date.now() + 60_000),
  });
  const accessToken = jwt.sign(
    {
      sub: user._id.toString(),
      sessionId: session._id.toString(),
      tokenType: "access",
    },
    config.JWT_SECRET,
    { expiresIn: "5m", algorithm: "HS256" },
  );
  return { user, session, accessToken };
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
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

test("registration validates required fields and password rules", async () => {
  const missing = await request("/api/auth/register", {
    method: "POST",
    body: { username: "valid_user" },
  });
  assert.equal(missing.response.status, 400);
  assert.equal(missing.body.message, "Validation failed");

  const shortPassword = await register("", { password: "short" });
  assert.equal(shortPassword.response.status, 400);
  assert.ok(
    shortPassword.body.errors.some(({ field }) => field === "password"),
  );

  const invalidEmail = await register("", { email: "not-an-email" });
  assert.equal(invalidEmail.response.status, 400);
  assert.ok(invalidEmail.body.errors.some(({ field }) => field === "email"));
});

test("student registration normalizes identity fields and stores a password hash", async () => {
  const { response, body, setCookie } = await register("", {
    username: "Test_Learner",
    email: "TEST@example.com",
    role: "ADMIN",
  });

  assert.equal(response.status, 201);
  assert.equal(body.user.role, "STUDENT");
  assert.equal(body.user.username, "test_learner");
  assert.equal(body.user.email, "test@example.com");
  assert.equal(body.user.isActive, true);
  assert.ok(body.user.createdAt);
  assert.ok(body.accessToken);
  assert.ok(setCookie?.includes("HttpOnly"));
  assert.equal("password" in body.user, false);

  const user = userById(body.user.id);
  assert.notEqual(user.password, "securePass123");
  assert.equal(await bcrypt.compare("securePass123", user.password), true);
});

test("instructor registration assigns instructor role and rejects duplicate accounts", async () => {
  const first = await register("/instructor");
  assert.equal(first.response.status, 201);
  assert.equal(first.body.user.role, "INSTRUCTOR");

  const duplicateEmail = await register("", {
    username: "different_user",
    email: "TEST@example.com",
  });
  assert.equal(duplicateEmail.response.status, 409);

  const duplicateUsername = await register("", {
    username: "TEST_LEARNER",
    email: "different@example.com",
  });
  assert.equal(duplicateUsername.response.status, 409);
});

test("login accepts username or email and rejects invalid credentials", async () => {
  await register("");

  const byUsername = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: "TEST_LEARNER", password: "securePass123" },
  });
  assert.equal(byUsername.response.status, 200);
  assert.ok(byUsername.body.accessToken);

  const byEmail = await request("/api/auth/login", {
    method: "POST",
    body: { email: "TEST@example.com", password: "securePass123" },
  });
  assert.equal(byEmail.response.status, 200);

  const invalid = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: "test_learner", password: "wrong-password" },
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.message, "Invalid credentials");
});

test("legacy SHA-256 passwords are upgraded after a successful login", async () => {
  const password = "legacyPass123";
  const legacyHash = createHash("sha256").update(password).digest("hex");
  await userModel.create({
    firstName: "Legacy",
    lastName: "Account",
    username: "legacy_account",
    email: "legacy@example.com",
    password: legacyHash,
    role: "STUDENT",
    isActive: true,
  });

  const loginResult = await request("/api/auth/login", {
    method: "POST",
    body: { email: "legacy@example.com", password },
  });
  assert.equal(loginResult.response.status, 200);
  const upgradedUser = [...users.values()][0];
  assert.notEqual(upgradedUser.password, legacyHash);
  assert.equal(await bcrypt.compare(password, upgradedUser.password), true);
});

test("inactive accounts cannot log in", async () => {
  await register("");
  const user = [...users.values()][0];
  user.isActive = false;

  const loginResult = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: user.username, password: "securePass123" },
  });
  assert.equal(loginResult.response.status, 403);
});

test("authentication protects profile routes and reports missing, invalid, and expired tokens", async () => {
  const missing = await request("/api/auth/me");
  assert.equal(missing.response.status, 401);

  const malformed = await request("/api/auth/me", { token: "not-a-jwt" });
  assert.equal(malformed.response.status, 401);
  assert.equal(malformed.body.message, "Access token is invalid");

  const expired = jwt.sign(
    { sub: "test", sessionId: "test", tokenType: "access" },
    config.JWT_SECRET,
    { expiresIn: -1, algorithm: "HS256" },
  );
  const expiredResult = await request("/api/auth/me", { token: expired });
  assert.equal(expiredResult.response.status, 401);
  assert.equal(expiredResult.body.message, "Access token has expired");

  const registration = await register("");
  const profile = await request("/api/auth/me", {
    token: registration.body.accessToken,
  });
  assert.equal(profile.response.status, 200);
  assert.equal(profile.body.user.email, "test@example.com");
  assert.equal("password" in profile.body.user, false);
});

test("refresh tokens rotate and logout invalidates the access session", async () => {
  const missingRefresh = await request("/api/auth/refresh-token", {
    method: "POST",
  });
  assert.equal(missingRefresh.response.status, 401);

  const invalidRefresh = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: "refreshToken=invalid-token",
  });
  assert.equal(invalidRefresh.response.status, 401);
  assert.equal(invalidRefresh.body.message, "Refresh token is invalid");

  const registration = await register("");
  const oldCookie = cookieValue(registration.setCookie);

  const refreshed = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: oldCookie,
  });
  assert.equal(refreshed.response.status, 200);
  assert.notEqual(cookieValue(refreshed.setCookie), oldCookie);

  const replay = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: oldCookie,
  });
  assert.equal(replay.response.status, 401);

  const logoutResult = await request("/api/auth/logout", {
    method: "POST",
    cookie: cookieValue(refreshed.setCookie),
  });
  assert.equal(logoutResult.response.status, 200);

  const profile = await request("/api/auth/me", {
    token: refreshed.body.accessToken,
  });
  assert.equal(profile.response.status, 401);
});

test("expired refresh tokens are rejected and their sessions are revoked", async () => {
  const { user } = await createAuthorizedUser("STUDENT");
  const expiredRefresh = jwt.sign(
    { sub: user._id.toString(), tokenType: "refresh" },
    config.JWT_SECRET,
    { expiresIn: -1, algorithm: "HS256" },
  );
  const refreshHash = createHash("sha256").update(expiredRefresh).digest("hex");
  const session = await sessionModel.create({
    user: user._id,
    refreshTokenHash: refreshHash,
    ip: "127.0.0.1",
    userAgent: "auth tests",
    expiresAt: new Date(Date.now() + 60_000),
  });

  const result = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: `refreshToken=${expiredRefresh}`,
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.message, "Refresh token has expired");
  assert.equal(session.revoked, true);
});

test("role middleware authorizes matching and multiple roles and denies other roles", async () => {
  for (const role of ["STUDENT", "INSTRUCTOR", "ADMIN"]) {
    let continued = false;
    authorizeRoles(role)({ user: { role } }, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
  }

  for (const role of ["ADMIN", "INSTRUCTOR"]) {
    let continued = false;
    authorizeRoles("ADMIN", "INSTRUCTOR")({ user: { role } }, {}, () => {
      continued = true;
    });
    assert.equal(continued, true);
  }

  let deniedStatus;
  authorizeRoles("ADMIN")(
    { user: { role: "STUDENT" } },
    {
      status(code) {
        deniedStatus = code;
        return this;
      },
      json() {},
    },
    () => assert.fail("Unauthorized role should not continue"),
  );
  assert.equal(deniedStatus, 403);

  let missingRoleStatus;
  authorizeRoles("ADMIN")(
    { user: {} },
    {
      status(code) {
        missingRoleStatus = code;
        return this;
      },
      json() {},
    },
    () => assert.fail("A missing role should not continue"),
  );
  assert.equal(missingRoleStatus, 403);

  let unauthenticatedStatus;
  authorizeRoles("ADMIN")(
    {},
    {
      status(code) {
        unauthenticatedStatus = code;
        return this;
      },
      json() {},
    },
    () => assert.fail("An unauthenticated request should not continue"),
  );
  assert.equal(unauthenticatedStatus, 401);
  assert.throws(() => authorizeRoles(), TypeError);
  assert.throws(() => authorizeRoles("SUPERUSER"), TypeError);
});

test("admin-only user listing rejects students and instructors", async () => {
  for (const role of ["STUDENT", "INSTRUCTOR"]) {
    const { accessToken } = await createAuthorizedUser(role);
    const result = await request("/api/admin/users", { token: accessToken });
    assert.equal(result.response.status, 403);
  }

  const { accessToken } = await createAuthorizedUser("ADMIN");
  const result = await request("/api/admin/users", { token: accessToken });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.users.length, 3);
  assert.equal(
    result.body.users.some((user) => Object.hasOwn(user, "password")),
    false,
  );
});
