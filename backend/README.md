# Backend API

## Authentication and roles

Use the access token returned by registration or login as
`Authorization: Bearer <accessToken>`. Refresh tokens are stored in an
HTTP-only cookie. Public registration creates `LEARNER` accounts by default;
`POST /api/auth/register/instructor` creates an instructor. Public request
fields cannot set an account role. An administrator must assign the first
`ADMIN` account through a trusted database/operations process.

Authentication middleware verifies the JWT, checks its active session, and
loads the user from MongoDB before role middleware authorizes the route.
Deactivating a user revokes that user's active sessions. Editing a published
course or lesson returns it to `DRAFT` for admin moderation.

## Route access

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | Register a learner |
| POST | `/api/auth/register/learner` | Public | Register a learner |
| POST | `/api/auth/register/instructor` | Public | Register an instructor |
| POST | `/api/auth/login` | Public | Log in with email or username |
| POST | `/api/auth/reactivate` | Public, credentials required | Reactivate an inactive account |
| POST | `/api/auth/refresh-token` | Refresh cookie | Rotate tokens |
| POST | `/api/auth/logout` | Refresh cookie or access token | Revoke session |
| GET | `/api/auth/me` | Any active user | Get current profile |
| GET/PATCH | `/api/users/me` | Any active user | Read or update own profile |
| GET | `/api/users/:userId` | Own account or admin | Read safe user details |
| PATCH | `/api/users/me/password` | Any active user | Change password and revoke sessions |
| PATCH | `/api/users/me/status` | Learner or instructor | Soft-deactivate own account |
| POST | `/api/users/me/profile-picture` | Any active user | Upload a JPEG, PNG, or WebP profile picture |
| GET | `/api/categories` | Any active user | List course categories |
| GET | `/api/student/dashboard` | Student | Student dashboard |
| GET | `/api/student/courses` | Student | Browse published courses |
| GET | `/api/student/courses/:courseId` | Student | View a published course |
| GET | `/api/student/courses/:courseId/enrollment` | Student | Check own enrollment and eligibility |
| GET | `/api/student/courses/:courseId/lessons/:lessonId` | Enrolled student | Open a published lesson and update continue-learning checkpoint |
| GET | `/api/student/courses/:courseId/lessons` | Enrolled student | View published lessons in a published course |
| POST | `/api/student/courses/:courseId/lessons/:lessonId/completion` | Active enrollment | Record completion of one published lesson |
| GET | `/api/student/enrollments` | Student | List own enrollments with calculated progress |
| POST | `/api/student/courses/:courseId/enrollments` | Student | Enroll in an available published course |
| PATCH | `/api/student/enrollments/:enrollmentId/withdraw` | Student | Withdraw from an active enrollment |
| GET/POST | `/api/instructor/courses` | Instructor | List or create own courses |
| PATCH/DELETE | `/api/instructor/courses/:courseId` | Owning instructor | Update own course or delete it when it has no enrollments |
| GET | `/api/instructor/courses/:courseId/enrollments` | Owning instructor | List course enrollments |
| GET/POST | `/api/instructor/courses/:courseId/lessons` | Owning instructor | List or create lessons |
| PATCH/DELETE | `/api/instructor/courses/:courseId/lessons/:lessonId` | Owning instructor | Update or delete own lesson |
| GET | `/api/admin/dashboard` | Admin | View user, course, lesson, and category counts |
| GET | `/api/admin/users` | Admin | Search, filter, sort, and paginate users |
| GET/PATCH | `/api/admin/users/:userId` | Admin | View or update a user's profile, role, or account status |
| GET/POST | `/api/admin/categories` | Admin | List or create categories |
| PATCH/DELETE | `/api/admin/categories/:categoryId` | Admin | Update or delete an unused category |
| GET | `/api/admin/courses` | Admin | List courses by moderation status (default `DRAFT`) |
| PATCH | `/api/admin/courses/:courseId/moderation` | Admin | Publish or reject a course |
| GET | `/api/admin/courses/:courseId/enrollments` | Admin | List course enrollments |
| PATCH | `/api/admin/enrollments/:enrollmentId/status` | Admin | Suspend or reactivate an enrollment |
| GET | `/api/admin/lessons` | Admin | List lessons by moderation status (default `DRAFT`) |
| PATCH | `/api/admin/lessons/:lessonId/moderation` | Admin | Publish or reject a lesson |

Course creation accepts `title`, `description`, and optional `category` ID.
Lessons accept `title`, `content`, and a positive integer `position`. New
courses and lessons start in `DRAFT`; only admins can publish or reject them.
Instructors can only read or modify resources they own.

Enrollments are unique per learner and course. Enrollment identity comes from
the authenticated learner, never from the request body. Repeating an enrollment
request is idempotent; a withdrawn enrollment is reactivated on re-enrollment,
while a suspended enrollment requires an authorized administrative process.
Reactivation retains the original `createdAt` and lesson progress/access
checkpoint. Only active or completed enrollments can access published lessons.
An instructor cannot hard-delete a course that has enrollments; it must be
archived instead. User deactivation is already a soft operation, so enrollment
history remains associated with the learner. Deleting a lesson clears any
enrollment continue-learning checkpoint that points to it.
Lesson completion is recorded per published lesson. Course progress is
calculated from completed progress records and currently published lessons;
the server marks an enrollment complete only when all eligible lessons are
complete. Clients cannot set enrollment status or submit a progress percentage.
The progress collection retains completion records if a lesson is later deleted
or unpublished, but only existing published lessons count toward progress.

### User management

Allowed account roles are `LEARNER`, `INSTRUCTOR`, and `ADMIN`; account
statuses are `ACTIVE`, `INACTIVE`, and `SUSPENDED`. Email addresses and
usernames are unique and are normalized to lowercase. Passwords are hashed
before storage and excluded from API responses.

`PATCH /api/users/me` accepts profile fields such as `firstName`, `lastName`,
`username`, `email`, `phone`, and `bio`; it does not accept `role`, `status`, or
other unlisted fields. A duplicate email or username returns HTTP 409.
Administrators can update a user's permitted profile fields, role, and status
through `PATCH /api/admin/users/:userId`. An administrator cannot remove their
own admin access, and the last active admin cannot be demoted or deactivated.

`GET /api/admin/users` accepts `search` (or `q`), `role`, `status`, `page`,
`limit`, `sortBy`, and `sortOrder`. Sort fields are `createdAt`, `name`,
`firstName`, `lastName`, and `username`; sort order is `asc` or `desc`.

Account closure uses reversible soft deactivation (`INACTIVE`), not permanent
deletion, so course ownership and other related records are retained.
Learners and instructors can deactivate their own account at
`PATCH /api/users/me/status`. Reactivation requires the account's current
credentials at `POST /api/auth/reactivate`; suspended accounts must be restored
by an administrator.

## Development and verification

Run the backend with `npm run dev` and run the authentication/RBAC and user
management API tests with `npm test`.
