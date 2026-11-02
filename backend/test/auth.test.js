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
  { default: emailService },
  { createRateLimiter },
  { authorizeRoles },
] = await Promise.all([
  import("../src/app.js"),
  import("../src/config/config.js"),
  import("../src/modules/users/user.model.js"),
  import("../src/modules/auth/session.model.js"),
  import("../src/services/email.service.js"),
  import("../src/middleware/rate-limit.middleware.js"),
  import("../src/middleware/role.middleware.js"),
]);

const users = new Map();
const sessions = new Map();
const verificationEmails = [];
let emailDeliveryError = null;
let server;
let baseUrl;

function userById(id) {
  return users.get(id.toString());
}

function sessionById(id) {
  return sessions.get(id.toString());
}

function matchesValue(value, condition) {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    if ("$exists" in condition) {
      return condition.$exists ? value !== undefined : value === undefined;
    }
    if ("$gt" in condition) return value > condition.$gt;
    if ("$lte" in condition) return value <= condition.$lte;
  }
  return value?.toString?.() === condition?.toString?.() || value === condition;
}

function matchesUser(user, query) {
  return (
    user &&
    (!query.$or ||
      query.$or.some((condition) =>
        Object.entries(condition).every(([field, value]) =>
          matchesValue(user[field], value),
        ),
      )) &&
    Object.entries(query).every(
      ([field, value]) =>
        field === "$or" || matchesValue(user[field], value),
    )
  );
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
    const result = [...users.values()].find((user) => matchesUser(user, query));
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
  userModel.findOneAndUpdate = async (query, update) => {
    const user = [...users.values()].find((item) => matchesUser(item, query));
    if (!user) return null;
    Object.assign(user, update.$set);
    for (const field of Object.keys(update.$unset ?? {})) delete user[field];
    return user;
  };
  userModel.updateOne = async (query, update) => {
    const user = [...users.values()].find((item) => matchesUser(item, query));
    if (!user) return { matchedCount: 0 };
    Object.assign(user, update.$set);
    for (const field of Object.keys(update.$unset ?? {})) delete user[field];
    return { matchedCount: 1 };
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
  emailService.sendVerificationEmail = async (message) => {
    if (emailDeliveryError) throw emailDeliveryError;
    verificationEmails.push(message);
    return { messageId: "test-message" };
  };
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  users.clear();
  sessions.clear();
  verificationEmails.length = 0;
  emailDeliveryError = null;
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
  assert.equal(body.user.role, "LEARNER");
  assert.equal(body.user.username, "test_learner");
  assert.equal(body.user.email, "test@example.com");
  assert.equal(body.user.isActive, true);
  assert.equal(body.user.isEmailVerified, false);
  assert.ok(body.user.createdAt);
  assert.ok(body.accessToken);
  assert.ok(setCookie?.includes("HttpOnly"));
  assert.equal("password" in body.user, false);

  const user = userById(body.user.id);
  assert.notEqual(user.password, "securePass123");
  assert.equal(await bcrypt.compare("securePass123", user.password), true);
  assert.equal(user.isEmailVerified, false);
  assert.equal(user.emailVerificationTokenHash.length, 64);
  assert.ok(user.emailVerificationExpiresAt > new Date(Date.now() + 29 * 60_000));
  assert.equal(verificationEmails.length, 1);
  assert.equal(
    createHash("sha256")
      .update(verificationEmails[0].token)
      .digest("hex"),
    user.emailVerificationTokenHash,
  );
  assert.equal("emailVerificationTokenHash" in body.user, false);
  assert.equal("emailVerificationExpiresAt" in body.user, false);
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

test("verification accepts a valid token exactly once and clears its stored hash", async () => {
  const registration = await register("");
  const token = verificationEmails[0].token;
  const result = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.message, "Email verified successfully. You can now sign in.");
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.equal(result.response.headers.get("referrer-policy"), "no-referrer");

  const user = userById(registration.body.user.id);
  assert.equal(user.isEmailVerified, true);
  assert.equal("emailVerificationTokenHash" in user, false);
  assert.equal("emailVerificationExpiresAt" in user, false);

  const reuse = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token },
  });
  assert.equal(reuse.response.status, 400);
});

test("invalid, malformed, and expired verification tokens are rejected", async () => {
  const missing = await request("/api/auth/verify-email", { method: "POST" });
  assert.equal(missing.response.status, 400);

  const malformed = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token: "not-a-token" },
  });
  assert.equal(malformed.response.status, 400);

  const registration = await register("");
  const token = verificationEmails[0].token;
  const user = userById(registration.body.user.id);
  user.emailVerificationExpiresAt = new Date(Date.now() - 1);

  const expired = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token },
  });
  assert.equal(expired.response.status, 400);
  assert.equal(user.isEmailVerified, false);
});

test("concurrent verification requests can consume a token only once", async () => {
  await register("");
  const token = verificationEmails[0].token;
  const verify = () =>
    request("/api/auth/verify-email", { method: "POST", body: { token } });
  const results = await Promise.all([verify(), verify()]);

  assert.deepEqual(
    results.map(({ response }) => response.status).sort(),
    [200, 400],
  );
});

test("resending replaces old tokens, enforces a cooldown, and remains generic", async () => {
  await register("");
  const user = [...users.values()][0];
  const oldToken = verificationEmails[0].token;

  const cooldown = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: user.email },
  });
  assert.equal(cooldown.response.status, 202);
  assert.equal(verificationEmails.length, 1);

  user.emailVerificationExpiresAt = new Date(Date.now() - 1);
  const resent = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: user.email.toUpperCase() },
  });
  assert.equal(resent.response.status, 202);
  assert.equal(verificationEmails.length, 2);
  assert.notEqual(
    user.emailVerificationTokenHash,
    createHash("sha256").update(oldToken).digest("hex"),
  );

  const oldTokenResult = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token: oldToken },
  });
  assert.equal(oldTokenResult.response.status, 400);

  const unknownEmail = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: "nobody@example.com" },
  });
  assert.equal(unknownEmail.response.status, 202);
  assert.equal(unknownEmail.body.message, resent.body.message);

  const verified = await request("/api/auth/verify-email", {
    method: "POST",
    body: { token: verificationEmails[1].token },
  });
  assert.equal(verified.response.status, 200);
  const alreadyVerified = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: user.email },
  });
  assert.equal(alreadyVerified.response.status, 202);
  assert.equal(verificationEmails.length, 2);
});

test("email delivery failure preserves the account and allows a later resend", async () => {
  emailDeliveryError = Object.assign(new Error("private SMTP failure"), {
    code: "ECONNECTION",
  });
  const registration = await register("");

  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.verificationEmailSent, false);
  assert.match(registration.body.message, /could not be sent/);
  const user = userById(registration.body.user.id);
  assert.equal(user.isEmailVerified, false);
  assert.equal("emailVerificationTokenHash" in user, false);
  assert.equal(verificationEmails.length, 0);
  assert.equal((await register("")).response.status, 409);

  emailDeliveryError = null;
  const resend = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: user.email },
  });
  assert.equal(resend.response.status, 202);
  assert.equal(verificationEmails.length, 1);
});

test("verification email input is validated and rate limiting rejects excess requests", async () => {
  const invalidEmail = await request("/api/auth/resend-verification-email", {
    method: "POST",
    body: { email: "not-an-email" },
  });
  assert.equal(invalidEmail.response.status, 400);

  const limiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 2,
    message: "Limited",
  });
  const statuses = [];
  const invokeLimiter = () =>
    limiter(
      { ip: "test-client" },
      {
        set() {},
        status(status) {
          statuses.push(status);
          return this;
        },
        json() {},
      },
      () => statuses.push(200),
    );

  invokeLimiter();
  invokeLimiter();
  invokeLimiter();
  assert.deepEqual(statuses, [200, 200, 429]);
  limiter.reset();
});

test("login accepts username or email and rejects invalid credentials", async () => {
  await register("");

  const byUsername = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: "TEST_LEARNER", password: "securePass123" },
  });
  assert.equal(byUsername.response.status, 200);
  assert.ok(byUsername.body.accessToken);
  assert.doesNotMatch(byUsername.setCookie, /;\s*max-age=/i);
  assert.equal([...sessions.values()][1].rememberMe, false);
  assert.ok(
    [...sessions.values()][1].expiresAt > new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  );
  assert.equal(byUsername.body.user.isEmailVerified, false);

  const byEmail = await request("/api/auth/login", {
    method: "POST",
    body: {
      email: "TEST@example.com",
      password: "securePass123",
      rememberMe: false,
    },
  });
  assert.equal(byEmail.response.status, 200);

  const invalid = await request("/api/auth/login", {
    method: "POST",
    body: { identifier: "test_learner", password: "wrong-password" },
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.body.message, "Invalid credentials");
});

test("remember me creates a persistent session and preserves its expiration on refresh", async () => {
  await register("");
  const user = [...users.values()][0];

  const loginResult = await request("/api/auth/login", {
    method: "POST",
    body: {
      identifier: user.username,
      password: "securePass123",
      rememberMe: true,
    },
  });
  assert.equal(loginResult.response.status, 200);
  assert.match(loginResult.setCookie, /;\s*max-age=/i);

  const initialCookie = cookieValue(loginResult.setCookie);
  const session = [...sessions.values()].find((item) => item.rememberMe);
  assert.ok(session);
  const originalExpiration = session.expiresAt.getTime();
  assert.ok(originalExpiration > Date.now() + 29 * 24 * 60 * 60 * 1000);
  assert.equal(
    jwt.decode(initialCookie.split("=")[1]).exp,
    Math.floor(originalExpiration / 1000),
  );

  const refreshed = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: initialCookie,
  });
  assert.equal(refreshed.response.status, 200);
  assert.match(refreshed.setCookie, /;\s*max-age=/i);
  assert.notEqual(cookieValue(refreshed.setCookie), initialCookie);
  assert.equal(session.expiresAt.getTime(), originalExpiration);
  assert.equal(
    jwt.decode(cookieValue(refreshed.setCookie).split("=")[1]).exp,
    Math.floor(originalExpiration / 1000),
  );
});

test("login rejects non-boolean rememberMe values", async () => {
  for (const rememberMe of ["true", 1, null]) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: {
        identifier: "learner@example.com",
        password: "securePass123",
        rememberMe,
      },
    });
    assert.equal(result.response.status, 400);
    assert.equal(
      result.body.errors.some((error) => error.field === "rememberMe"),
      true,
    );
  }
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
    role: "LEARNER",
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
  assert.match(logoutResult.setCookie, /^refreshToken=;/);
  assert.equal([...sessions.values()][0].revoked, true);

  const profile = await request("/api/auth/me", {
    token: refreshed.body.accessToken,
  });
  assert.equal(profile.response.status, 401);
});

test("logout with an access token revokes its session when the refresh cookie is absent", async () => {
  const registration = await register("");
  const session = [...sessions.values()][0];

  const logoutResult = await request("/api/auth/logout", {
    method: "POST",
    token: registration.body.accessToken,
  });
  assert.equal(logoutResult.response.status, 200);
  assert.equal(session.revoked, true);
  assert.match(logoutResult.setCookie, /^refreshToken=;/);
});

test("expired refresh tokens are rejected and their sessions are revoked", async () => {
  const { user } = await createAuthorizedUser("LEARNER");
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

test("refresh rejects an expired server-side session", async () => {
  const { user } = await createAuthorizedUser("LEARNER");
  const validRefresh = jwt.sign(
    {
      sub: user._id.toString(),
      tokenType: "refresh",
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    config.JWT_SECRET,
    { algorithm: "HS256" },
  );
  const refreshHash = createHash("sha256").update(validRefresh).digest("hex");
  await sessionModel.create({
    user: user._id,
    refreshTokenHash: refreshHash,
    ip: "127.0.0.1",
    userAgent: "auth tests",
    expiresAt: new Date(Date.now() - 1),
  });

  const result = await request("/api/auth/refresh-token", {
    method: "POST",
    cookie: `refreshToken=${validRefresh}`,
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.message, "Invalid refresh token");
});

test("role middleware authorizes matching and multiple roles and denies other roles", async () => {
  for (const role of ["LEARNER", "INSTRUCTOR", "ADMIN"]) {
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
    { user: { role: "LEARNER" } },
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
  for (const role of ["LEARNER", "INSTRUCTOR"]) {
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
