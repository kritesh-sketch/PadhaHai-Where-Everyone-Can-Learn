# Backend API

## Authentication and roles

Use the access token returned by registration or login as
`Authorization: Bearer <accessToken>`. Refresh tokens are stored in an
HTTP-only cookie. Public registration creates `STUDENT` accounts by default;
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
| POST | `/api/auth/register` | Public | Register a student |
| POST | `/api/auth/register/instructor` | Public | Register an instructor |
| POST | `/api/auth/login` | Public | Log in with email or username |
| POST | `/api/auth/refresh-token` | Refresh cookie | Rotate tokens |
| POST | `/api/auth/logout` | Refresh cookie or access token | Revoke session |
| GET | `/api/auth/me` | Any active user | Get current profile |
| GET | `/api/categories` | Any active user | List course categories |
| GET | `/api/student/dashboard` | Student | Student dashboard |
| GET | `/api/student/courses` | Student | Browse published courses |
| GET | `/api/student/courses/:courseId` | Student | View a published course |
| GET | `/api/student/courses/:courseId/lessons` | Student | View published lessons in a published course |
| GET/POST | `/api/instructor/courses` | Instructor | List or create own courses |
| PATCH/DELETE | `/api/instructor/courses/:courseId` | Owning instructor | Update or delete own course |
| GET/POST | `/api/instructor/courses/:courseId/lessons` | Owning instructor | List or create lessons |
| PATCH/DELETE | `/api/instructor/courses/:courseId/lessons/:lessonId` | Owning instructor | Update or delete own lesson |
| GET | `/api/admin/dashboard` | Admin | View user, course, lesson, and category counts |
| GET/PATCH | `/api/admin/users` and `/api/admin/users/:userId` | Admin | List users or change roles/account status |
| GET/POST | `/api/admin/categories` | Admin | List or create categories |
| PATCH/DELETE | `/api/admin/categories/:categoryId` | Admin | Update or delete an unused category |
| GET | `/api/admin/courses` | Admin | List courses by moderation status (default `DRAFT`) |
| PATCH | `/api/admin/courses/:courseId/moderation` | Admin | Publish or reject a course |
| GET | `/api/admin/lessons` | Admin | List lessons by moderation status (default `DRAFT`) |
| PATCH | `/api/admin/lessons/:lessonId/moderation` | Admin | Publish or reject a lesson |

Course creation accepts `title`, `description`, and optional `category` ID.
Lessons accept `title`, `content`, and a positive integer `position`. New
courses and lessons start in `DRAFT`; only admins can publish or reject them.
Instructors can only read or modify resources they own.

## Development and verification

Run the backend with `npm run dev` and run the authentication/RBAC API tests
with `npm test`.
