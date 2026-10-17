import courseModel from "../courses/course.model.js";
import lessonModel from "../lessons/lesson.model.js";
import progressModel from "../progress/progress.model.js";
import enrollmentModel from "./enrollment.model.js";
import {
  parseEnrollmentListQuery,
  validateCourseId,
  validateEnrollmentId,
  validateLessonId,
} from "./enrollment.validation.js";

/**
 * Represents an application-specific error raised by enrollment operations.
 *
 * Extends the built-in Error class with an HTTP status code and optional
 * validation details, allowing enrollment-related failures to be handled
 * consistently by centralized error-handling middleware.
 */
export class EnrollmentError extends Error {
  /**
   * Creates an enrollment error with an HTTP status code and optional details.
   *
   * @param {number} statusCode - The HTTP status code associated with the error.
   * @param {string} message - A human-readable description of the error.
   * @param {Array<Object>|undefined} errors - Optional validation or field-level error details.
   */
  constructor(statusCode, message, errors = undefined) {
    // Initialize the built-in Error with the provided message.
    super(message);

    // Set a distinct error name to identify enrollment-related failures.
    this.name = "EnrollmentError";

    // Store the HTTP status code for the error-handling middleware.
    this.statusCode = statusCode;

    // Store optional validation details for inclusion in the error response.
    this.errors = errors;
  }
}

/**
 * Ensures that the current user is an active learner.
 *
 * Validates the user's role and account status before allowing enrollment
 * operations. Throws an EnrollmentError when the user is unauthorized
 * or their account is unavailable.
 *
 * @param {Object} user - The authenticated user attempting the enrollment operation.
 * @throws {EnrollmentError} If the user is not a learner or their account is unavailable.
 * @returns {void} Does not return a value when validation succeeds.
 */
function requireLearner(user) {
  // Restrict enrollment operations to authenticated users with the LEARNER role.
  if (!user || user.role !== "LEARNER") {
    throw new EnrollmentError(
      403,
      "Only learners can manage their enrollments",
    );
  }

  // Prevent learners with inactive or non-active accounts from managing enrollments.
  if (user.isActive === false || user.status !== "ACTIVE") {
    throw new EnrollmentError(403, "Learner account is unavailable");
  }
}

/**
 * Reactivates an existing withdrawn enrollment.
 *
 * Finds the learner's enrollment for the specified course only when its
 * current status is WITHDRAWN. Resets the enrollment to ACTIVE and clears
 * completion, withdrawal, and suspension metadata.
 *
 * @param {string|Object} learnerId - The ID of the learner who owns the enrollment.
 * @param {string|Object} courseId - The ID of the course associated with the enrollment.
 * @returns {Promise<Object|null>} The updated enrollment document, or null if no matching withdrawn enrollment exists.
 */
async function activateWithdrawnEnrollment(learnerId, courseId) {
  // Find the learner's withdrawn enrollment for the specified course and reactivate it.
  return enrollmentModel.findOneAndUpdate(
    { learner: learnerId, course: courseId, status: "WITHDRAWN" },
    {
      $set: {
        status: "ACTIVE", // Restore the enrollment to active status.
        completedAt: null, // Clear the previous completion timestamp.
        withdrawnAt: null, // Remove the previous withdrawal timestamp.
        suspendedAt: null, // Clear any previous suspension timestamp.
        suspendedBy: null, // Remove the previous suspension actor.
      },
    },
    { new: true, runValidators: true },
  );
}

/**
 * Enrolls an authenticated learner in a published course.
 *
 * Validates learner eligibility, course availability, and enrollment capacity.
 * Returns an existing enrollment when applicable, reactivates withdrawn
 * enrollments, and creates a new enrollment when no previous record exists.
 * Handles duplicate-key errors to account for concurrent enrollment requests.
 *
 * @param {Object} user - The authenticated user requesting enrollment.
 * @param {string|Object} courseId - The ID of the course the learner wants to join.
 * @throws {EnrollmentError} If the learner is ineligible, the course is unavailable, or enrollment cannot proceed.
 * @returns {Promise<Object>} An object containing the enrollment document and creation/reactivation flags.
 */
export async function enrollLearner(user, courseId) {
  // Ensure that only active learners can perform enrollment operations.
  requireLearner(user);

  // Reject invalid course identifiers before querying the database.
  if (!validateCourseId(courseId)) {
    throw new EnrollmentError(400, "Course ID is invalid");
  }

  // Retrieve the published course and the fields required for enrollment checks.
  const course = await courseModel
    .findOne({ _id: courseId, status: "PUBLISHED" })
    .select("_id enrollmentOpen visibility maxStudents")
    .lean();

  // Return a not-found error when the course does not exist or is not published.
  if (!course) {
    throw new EnrollmentError(404, "Course not found");
  }

  // Prevent enrollment when the course is closed or restricted to private access.
  if (course.enrollmentOpen === false || course.visibility === "PRIVATE") {
    throw new EnrollmentError(409, "Course is not accepting enrollments");
  }

  // Extract the authenticated learner's ID for enrollment queries and updates.
  const learnerId = user._id;

  // Check whether this learner already has an enrollment record for the course.
  const existing = await enrollmentModel.findOne({
    learner: learnerId,
    course: courseId,
  });

  // Prevent suspended enrollments from being reactivated through the enrollment endpoint.
  if (existing?.status === "SUSPENDED") {
    throw new EnrollmentError(
      409,
      "This enrollment is suspended and cannot be reactivated",
    );
  } else if (existing && existing.status !== "WITHDRAWN") {
    // Return the existing enrollment when it does not need reactivation.
    return { enrollment: existing, created: false, reactivated: false };
  }

  // Enforce the course capacity limit when a maximum enrollment count is configured.
  if (course.maxStudents !== null && course.maxStudents !== undefined) {
    // Count active and completed enrollments toward the course's capacity.
    const activeEnrollmentCount = await enrollmentModel.countDocuments({
      course: courseId,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    });

    // Reject enrollment when the configured capacity has already been reached.
    if (activeEnrollmentCount >= course.maxStudents) {
      throw new EnrollmentError(409, "Course has reached its enrollment limit");
    }
  }

  // Reactivate the existing record instead of creating a duplicate enrollment.
  if (existing?.status === "WITHDRAWN") {
    const reactivated = await activateWithdrawnEnrollment(learnerId, courseId);

    // Return the reactivated enrollment when the update succeeds.
    if (reactivated) {
      return { enrollment: reactivated, created: false, reactivated: true };
    }
  }

  try {
    // Create a new active enrollment when no reusable enrollment record exists.
    const enrollment = await enrollmentModel.create({
      learner: learnerId,
      course: courseId,
      status: "ACTIVE",
    });

    // Indicate that a new enrollment record was created.
    return { enrollment, created: true, reactivated: false };
  } catch (error) {
    // Re-throw errors that are unrelated to duplicate enrollment records.
    if (error.code !== 11000) {
      throw error;
    }

    // Retrieve the enrollment created or modified by a concurrent request.
    const racedEnrollment = await enrollmentModel.findOne({
      learner: learnerId,
      course: courseId,
    });

    // Retry reactivation if another request left the enrollment withdrawn.
    if (racedEnrollment?.status === "WITHDRAWN") {
      // Recheck course capacity before attempting to reactivate the enrollment.
      if (course.maxStudents !== null && course.maxStudents !== undefined) {
        const activeEnrollmentCount = await enrollmentModel.countDocuments({
          course: courseId,
          status: { $in: ["ACTIVE", "COMPLETED"] },
        });

        // Prevent reactivation if the course has reached its enrollment limit.
        if (activeEnrollmentCount >= course.maxStudents) {
          throw new EnrollmentError(
            409,
            "Course has reached its enrollment limit",
          );
        }
      }

      // Attempt to reactivate the existing enrollment after the duplicate-key conflict.
      const reactivated = await activateWithdrawnEnrollment(
        learnerId,
        courseId,
      );

      // Return the reactivated enrollment when the update succeeds.
      if (reactivated) {
        return { enrollment: reactivated, created: false, reactivated: true };
      }
    }

    // Preserve the restriction against reactivating suspended enrollments.
    if (racedEnrollment?.status === "SUSPENDED") {
      throw new EnrollmentError(
        409,
        "This enrollment is suspended and cannot be reactivated",
      );
    }

    // Return the enrollment created by the competing request when it exists.
    if (racedEnrollment) {
      return {
        enrollment: racedEnrollment,
        created: false,
        reactivated: false,
      };
    }

    // Return a conflict when the duplicate-key error cannot be reconciled with an existing record.
    throw new EnrollmentError(409, "Enrollment already exists");
  }
}
/**
 * Retrieves the authenticated learner's enrollments with pagination and progress details.
 *
 * Validates the learner and query parameters, retrieves matching enrollments,
 * and calculates completed lessons, total published lessons, and progress
 * percentages for each enrolled course.
 *
 * @param {Object} user - The authenticated learner requesting their enrollments.
 * @param {Object} query - Optional pagination and enrollment status filters.
 * @throws {EnrollmentError} If the user is unauthorized or query validation fails.
 * @returns {Promise<Object>} The enrollments and pagination metadata.
 */
export async function listLearnerEnrollments(user, query = {}) {
  // Ensure that only active learners can retrieve their enrollments.
  requireLearner(user);

  // Parse and validate pagination parameters and the optional status filter.
  const parsed = parseEnrollmentListQuery(query);
  if (parsed.errors.length > 0) {
    throw new EnrollmentError(400, "Validation failed", parsed.errors);
  }

  // Restrict the results to enrollments belonging to the authenticated learner.
  const filter = { learner: user._id };

  // Apply the requested enrollment status when a filter is provided.
  if (parsed.status) {
    filter.status = parsed.status;
  }

  // Retrieve the requested enrollment page and total matching record count concurrently.
  const [enrollments, total] = await Promise.all([
    enrollmentModel
      .find(filter)
      // Include essential course details for displaying enrolled courses.
      .populate(
        "course",
        "title slug thumbnail level language status instructor",
      )
      // Include details about the lesson the learner last accessed.
      .populate("lastAccessedLesson", "title position status")
      // Show recently updated enrollments first.
      .sort({ updatedAt: -1 })
      // Skip records from earlier pages.
      .skip((parsed.page - 1) * parsed.limit)
      // Limit the number of returned enrollment records.
      .limit(parsed.limit)
      // Return plain JavaScript objects instead of Mongoose documents.
      .lean(),
    enrollmentModel.countDocuments(filter),
  ]);

  // Collect course IDs from enrollments with a successfully populated course.
  const courseIds = enrollments
    .map((enrollment) => enrollment.course?._id)
    .filter(Boolean);

  // Calculate progress only when the current page contains valid course references.
  if (courseIds.length > 0) {
    // Retrieve completed published lessons and total published lessons for each course.
    const [completedByCourse, lessonsByCourse] = await Promise.all([
      progressModel.aggregate([
        // Include progress records belonging to this learner and the current courses.
        {
          $match: {
            learner: user._id,
            course: { $in: courseIds },
          },
        },
        // Join lesson documents to verify their publication status.
        {
          $lookup: {
            from: lessonModel.collection.name,
            localField: "lesson",
            foreignField: "_id",
            as: "lesson",
          },
        },
        // Convert the joined lesson array into individual lesson documents.
        { $unwind: "$lesson" },
        // Count progress only for lessons that are currently published.
        { $match: { "lesson.status": "PUBLISHED" } },
        // Group completed lesson records by course.
        { $group: { _id: "$course", count: { $sum: 1 } } },
      ]),
      lessonModel.aggregate([
        // Include published lessons belonging to the courses on the current page.
        {
          $match: {
            course: { $in: courseIds },
            status: "PUBLISHED",
          },
        },
        // Calculate the total published lesson count for each course.
        { $group: { _id: "$course", count: { $sum: 1 } } },
      ]),
    ]);

    // Index completed lesson counts by course ID for efficient lookup.
    const completedCounts = new Map(
      completedByCourse.map((item) => [item._id.toString(), item.count]),
    );

    // Index total published lesson counts by course ID.
    const lessonCounts = new Map(
      lessonsByCourse.map((item) => [item._id.toString(), item.count]),
    );

    // Attach progress summaries to each enrollment in the current page.
    for (const enrollment of enrollments) {
      const courseId = enrollment.course?._id?.toString();

      // Default missing counts to zero when a course has no matching records.
      const completedLessons = completedCounts.get(courseId) ?? 0;
      const totalLessons = lessonCounts.get(courseId) ?? 0;

      // Calculate a rounded completion percentage without exceeding 100%.
      enrollment.progress = {
        completedLessons,
        totalLessons,
        percentage:
          totalLessons === 0
            ? 0
            : Math.min(
                100,
                Math.round((completedLessons / totalLessons) * 100),
              ),
      };
    }
  }

  // Return the enrollment page together with pagination information.
  return {
    enrollments,
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages: Math.ceil(total / parsed.limit),
    },
  };
}

/**
 * Withdraws an active enrollment belonging to the authenticated learner.
 *
 * Validates the enrollment ID, updates the enrollment status to WITHDRAWN,
 * and records the withdrawal timestamp. Returns an error when the enrollment
 * does not exist or is not currently active.
 *
 * @param {Object} user - The authenticated learner requesting withdrawal.
 * @param {string|Object} enrollmentId - The enrollment identifier.
 * @throws {EnrollmentError} If validation fails, the enrollment is missing, or its status prevents withdrawal.
 * @returns {Promise<Object>} The updated enrollment document.
 */
export async function withdrawEnrollment(user, enrollmentId) {
  // Ensure that only active learners can withdraw their enrollments.
  requireLearner(user);

  // Reject invalid enrollment identifiers before querying the database.
  if (!validateEnrollmentId(enrollmentId)) {
    throw new EnrollmentError(400, "Enrollment ID is invalid");
  }

  // Withdraw the enrollment only when it belongs to the learner and is active.
  const enrollment = await enrollmentModel.findOneAndUpdate(
    {
      _id: enrollmentId,
      learner: user._id,
      status: "ACTIVE",
    },
    { $set: { status: "WITHDRAWN", withdrawnAt: new Date() } },
    { new: true, runValidators: true },
  );

  // Return the updated enrollment when the withdrawal succeeds.
  if (enrollment) {
    return enrollment;
  }

  // Determine whether the enrollment is missing or simply ineligible for withdrawal.
  const existing = await enrollmentModel.findOne({
    _id: enrollmentId,
    learner: user._id,
  });

  // Return not found when the enrollment does not belong to this learner or no longer exists.
  if (!existing) {
    throw new EnrollmentError(404, "Enrollment not found");
  }

  // Allow withdrawal only from the ACTIVE status.
  throw new EnrollmentError(409, "Only active enrollments can be withdrawn");
}

/**
 * Records the learner's most recently accessed lesson for an enrolled course.
 *
 * Validates the course and lesson identifiers, verifies that both are published
 * and that the learner has an eligible enrollment, then updates the last-access
 * information on that enrollment.
 *
 * @param {Object} user - The authenticated learner accessing the lesson.
 * @param {string|Object} courseId - The identifier of the course being accessed.
 * @param {string|Object} lessonId - The identifier of the lesson being accessed.
 * @throws {EnrollmentError} If identifiers are invalid, the course or lesson is unavailable, or enrollment is missing.
 * @returns {Promise<Object>} The updated enrollment and lesson document.
 */
export async function updateEnrollmentAccess(user, courseId, lessonId) {
  // Ensure that only active learners can record lesson access.
  requireLearner(user);

  // Validate both identifiers before performing database queries.
  if (!validateCourseId(courseId) || !validateLessonId(lessonId)) {
    throw new EnrollmentError(400, "Course or lesson ID is invalid");
  }

  // Fetch the published course, its published lesson, and the learner's enrollment concurrently.
  const [course, lesson, enrollment] = await Promise.all([
    courseModel
      .findOne({ _id: courseId, status: "PUBLISHED" })
      .select("_id visibility")
      .lean(),
    lessonModel
      .findOne({
        _id: lessonId,
        course: courseId,
        status: "PUBLISHED",
      })
      .lean(),
    enrollmentModel.findOne({
      learner: user._id,
      course: courseId,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    }),
  ]);

  // Treat missing or private courses and unavailable lessons as not found.
  if (!course || course.visibility === "PRIVATE" || !lesson) {
    throw new EnrollmentError(404, "Published course or lesson not found");
  }

  // Require an active or completed enrollment before allowing lesson access tracking.
  if (!enrollment) {
    throw new EnrollmentError(403, "An active enrollment is required");
  }

  // Record the lesson and the time it was last accessed.
  const lastAccessedAt = new Date();
  const updated = await enrollmentModel.findOneAndUpdate(
    {
      _id: enrollment._id,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    },
    { $set: { lastAccessedLesson: lessonId, lastAccessedAt } },
    { new: true, runValidators: true },
  );

  // Handle cases where the enrollment becomes ineligible before the update completes.
  if (!updated) {
    throw new EnrollmentError(409, "Enrollment is no longer available");
  }

  // Return the updated enrollment alongside the accessed lesson.
  return { enrollment: updated, lesson };
}

/**
 * Marks a published lesson as completed for an enrolled learner.
 *
 * Records lesson access, creates a progress record if one does not already
 * exist, calculates course completion progress, and marks the enrollment
 * as COMPLETED when all published lessons have been completed.
 *
 * @param {Object} user - The authenticated learner completing the lesson.
 * @param {string|Object} courseId - The identifier of the course.
 * @param {string|Object} lessonId - The identifier of the lesson being completed.
 * @throws {EnrollmentError} If identifiers are invalid, the course or lesson is unavailable, or enrollment is missing.
 * @returns {Promise<Object>} The enrollment and calculated lesson progress.
 */
export async function completeLesson(user, courseId, lessonId) {
  // Ensure that only active learners can update lesson progress.
  requireLearner(user);

  // Validate the course and lesson identifiers before querying the database.
  if (!validateCourseId(courseId) || !validateLessonId(lessonId)) {
    throw new EnrollmentError(400, "Course or lesson ID is invalid");
  }

  // Retrieve the published course, its lesson, and the learner's eligible enrollment concurrently.
  const [course, lesson, enrollment] = await Promise.all([
    courseModel
      .findOne({ _id: courseId, status: "PUBLISHED" })
      .select("_id visibility")
      .lean(),
    lessonModel
      .findOne({
        _id: lessonId,
        course: courseId,
        status: "PUBLISHED",
      })
      .select("_id")
      .lean(),
    enrollmentModel.findOne({
      learner: user._id,
      course: courseId,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    }),
  ]);

  // Reject unavailable courses, private courses, or unpublished lessons.
  if (!course || course.visibility === "PRIVATE" || !lesson) {
    throw new EnrollmentError(404, "Published course or lesson not found");
  }

  // Require an active or completed enrollment to record lesson completion.
  if (!enrollment) {
    throw new EnrollmentError(403, "An active enrollment is required");
  }

  // Update the learner's last-accessed lesson before recording completion.
  const accessedEnrollment = await enrollmentModel.findOneAndUpdate(
    {
      _id: enrollment._id,
      status: { $in: ["ACTIVE", "COMPLETED"] },
    },
    { $set: { lastAccessedLesson: lessonId, lastAccessedAt: new Date() } },
    { new: true, runValidators: true },
  );

  // Stop processing if the enrollment became unavailable during the update.
  if (!accessedEnrollment) {
    throw new EnrollmentError(409, "Enrollment is no longer available");
  }

  try {
    // Create a progress record once; preserve the original completion timestamp on repeated requests.
    await progressModel.updateOne(
      { learner: user._id, course: courseId, lesson: lessonId },
      { $setOnInsert: { completedAt: new Date() } },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    // Handle duplicate-key errors that can occur when concurrent requests create the same progress record.
    if (error.code !== 11000) {
      throw error;
    }

    // Confirm that the competing request successfully created the progress record.
    const completedRecord = await progressModel.findOne({
      learner: user._id,
      course: courseId,
      lesson: lessonId,
    });

    // Re-throw the error if no matching progress record exists.
    if (!completedRecord) {
      throw error;
    }
  }

  // Calculate the number of completed published lessons and total published lessons concurrently.
  const [completedByCourse, eligibleLessons] = await Promise.all([
    progressModel.aggregate([
      // Restrict progress records to this learner and course.
      { $match: { learner: user._id, course: courseId } },
      // Join lesson records so unpublished lessons are excluded from progress.
      {
        $lookup: {
          from: lessonModel.collection.name,
          localField: "lesson",
          foreignField: "_id",
          as: "lesson",
        },
      },
      // Convert the joined lesson array into individual documents.
      { $unwind: "$lesson" },
      // Count only completed progress records for published lessons.
      { $match: { "lesson.status": "PUBLISHED" } },
      { $count: "count" },
    ]),
    // Count all published lessons eligible for course completion.
    lessonModel.countDocuments({ course: courseId, status: "PUBLISHED" }),
  ]);

  // Default the completed lesson count to zero when no matching records exist.
  const completedLessons = completedByCourse[0]?.count ?? 0;
  let completedEnrollment = accessedEnrollment;

  // Mark an active enrollment complete when every published lesson is completed.
  if (
    enrollment.status === "ACTIVE" &&
    eligibleLessons > 0 &&
    completedLessons >= eligibleLessons
  ) {
    completedEnrollment = await enrollmentModel.findOneAndUpdate(
      { _id: enrollment._id, status: "ACTIVE" },
      { $set: { status: "COMPLETED", completedAt: new Date() } },
      { new: true, runValidators: true },
    );
  }

  // Return the latest enrollment state and the learner's calculated progress.
  return {
    enrollment: completedEnrollment ?? enrollment,
    progress: {
      completedLessons,
      totalLessons: eligibleLessons,
      percentage:
        eligibleLessons === 0
          ? 0
          : Math.min(
              100,
              Math.round((completedLessons / eligibleLessons) * 100),
            ),
    },
  };
}

/**
 * Retrieves enrollments for a course that an instructor owns or an administrator manages.
 *
 * Validates the caller's role and course access, applies optional status
 * filtering and pagination, and includes basic learner information in each
 * enrollment record.
 *
 * @param {Object} user - The authenticated instructor or administrator.
 * @param {string|Object} courseId - The identifier of the course.
 * @param {Object} query - Optional pagination and enrollment status filters.
 * @throws {EnrollmentError} If authorization, course validation, or query validation fails.
 * @returns {Promise<Object>} The course enrollments and pagination metadata.
 */
export async function listCourseEnrollments(user, courseId, query = {}) {
  // Restrict enrollment listing to instructors and administrators.
  if (!user || !["INSTRUCTOR", "ADMIN"].includes(user.role)) {
    throw new EnrollmentError(
      403,
      "Only the course instructor or an administrator can view enrollments",
    );
  }

  // Reject invalid course identifiers before querying the database.
  if (!validateCourseId(courseId)) {
    throw new EnrollmentError(400, "Course ID is invalid");
  }

  // Build the course lookup filter using the requested course ID.
  const courseFilter = { _id: courseId };

  // Restrict instructors to courses they own; administrators may view any course.
  if (user.role === "INSTRUCTOR") {
    courseFilter.instructor = user._id;
  }

  // Confirm that the course exists and is accessible to the caller.
  const course = await courseModel.findOne(courseFilter).select("_id").lean();
  if (!course) {
    throw new EnrollmentError(404, "Course not found");
  }

  // Parse and validate the pagination and status query parameters.
  const parsed = parseEnrollmentListQuery(query);

  // Reject invalid query parameters before retrieving enrollment records.
  if (parsed.errors.length > 0) {
    throw new EnrollmentError(400, "Validation failed", parsed.errors);
  }

  // Restrict enrollment records to the selected course.
  const filter = { course: courseId };

  // Apply the optional status filter when supplied.
  if (parsed.status) filter.status = parsed.status;

  // Retrieve the enrollment page and total matching count concurrently.
  const [enrollments, total] = await Promise.all([
    enrollmentModel
      .find(filter)
      // Include basic learner information for instructor and administrator views.
      .populate("learner", "firstName lastName username")
      // Display the most recently created enrollments first.
      .sort({ createdAt: -1 })
      // Skip records belonging to previous pages.
      .skip((parsed.page - 1) * parsed.limit)
      // Limit the number of records returned.
      .limit(parsed.limit)
      // Return plain objects suitable for the API response.
      .lean(),
    enrollmentModel.countDocuments(filter),
  ]);

  // Return the enrollment list with pagination metadata.
  return {
    enrollments,
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages: Math.ceil(total / parsed.limit),
    },
  };
}

/**
 * Activates or suspends an enrollment through an administrative action.
 *
 * Verifies administrator authorization, validates the enrollment identifier
 * and requested status, checks the current status transition, and records
 * or clears suspension metadata accordingly.
 *
 * @param {Object} admin - The authenticated administrator performing the action.
 * @param {string|Object} enrollmentId - The identifier of the enrollment to update.
 * @param {string} status - The requested enrollment status: ACTIVE or SUSPENDED.
 * @throws {EnrollmentError} If authorization, validation, or status transition checks fail.
 * @returns {Promise<Object>} The updated enrollment document.
 */
export async function setEnrollmentSuspension(admin, enrollmentId, status) {
  // Restrict enrollment suspension actions to administrators.
  if (!admin || admin.role !== "ADMIN") {
    throw new EnrollmentError(
      403,
      "Only administrators can suspend enrollments",
    );
  }

  // Reject invalid enrollment identifiers.
  if (!validateEnrollmentId(enrollmentId)) {
    throw new EnrollmentError(400, "Enrollment ID is invalid");
  }

  // Allow only the supported administrative status changes.
  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    throw new EnrollmentError(400, "Only ACTIVE or SUSPENDED is allowed");
  }

  // Retrieve the current enrollment to validate the requested status transition.
  const current = await enrollmentModel.findById(enrollmentId);
  if (!current) {
    throw new EnrollmentError(404, "Enrollment not found");
  }

  // Prevent invalid transitions, such as suspending a completed or withdrawn enrollment.
  if (
    (status === "SUSPENDED" && current.status !== "ACTIVE") ||
    (status === "ACTIVE" && current.status !== "SUSPENDED")
  ) {
    throw new EnrollmentError(
      409,
      "Enrollment cannot make that status transition",
    );
  }

  // Record suspension details or clear them when restoring an enrollment to active status.
  const fields =
    status === "SUSPENDED"
      ? { status, suspendedAt: new Date(), suspendedBy: admin._id }
      : { status, suspendedAt: null, suspendedBy: null };

  // Update only if the enrollment still has the status checked above.
  const enrollment = await enrollmentModel.findOneAndUpdate(
    { _id: enrollmentId, status: current.status },
    { $set: fields },
    { new: true, runValidators: true },
  );

  // Report a conflict if another request changed the enrollment first.
  if (!enrollment) {
    throw new EnrollmentError(409, "Enrollment changed; retry the request");
  }

  // Return the updated enrollment document.
  return enrollment;
}

/**
 * Retrieves a learner's enrollment status and eligibility for a course.
 *
 * Verifies learner eligibility and course availability, checks for an
 * existing enrollment, and determines whether the learner can enroll
 * based on enrollment status and course capacity.
 *
 * @param {Object} user - The authenticated learner checking enrollment eligibility.
 * @param {string|Object} courseId - The identifier of the course.
 * @throws {EnrollmentError} If the learner is unauthorized, the course ID is invalid, or the course is unavailable.
 * @returns {Promise<Object>} The existing enrollment, if any, and a boolean indicating whether enrollment is allowed.
 */
export async function getLearnerEnrollmentStatus(user, courseId) {
  // Ensure that only active learners can check enrollment eligibility.
  requireLearner(user);

  // Validate the course identifier before querying the database.
  if (!validateCourseId(courseId)) {
    throw new EnrollmentError(400, "Course ID is invalid");
  }

  // Retrieve the published course and fields needed to determine enrollment availability.
  const course = await courseModel
    .findOne({ _id: courseId, status: "PUBLISHED" })
    .select("_id enrollmentOpen visibility maxStudents")
    .lean();

  // Return not found when the course does not exist or is not published.
  if (!course) {
    throw new EnrollmentError(404, "Course not found");
  }

  // Check whether the learner already has an enrollment for this course.
  const enrollment = await enrollmentModel.findOne({
    learner: user._id,
    course: courseId,
  });

  if (enrollment) {
    // Determine whether the course currently accepts new or reactivated enrollments.
    const courseAvailable =
      course.enrollmentOpen !== false && course.visibility !== "PRIVATE";

    // Count active and completed enrollments only when the course has a capacity limit.
    const activeEnrollmentCount =
      course.maxStudents === null || course.maxStudents === undefined
        ? 0
        : await enrollmentModel.countDocuments({
            course: courseId,
            status: { $in: ["ACTIVE", "COMPLETED"] },
          });

    // Allow enrollment again only for withdrawn records when course conditions permit it.
    return {
      enrollment,
      canEnroll:
        enrollment.status === "WITHDRAWN" &&
        courseAvailable &&
        (course.maxStudents === null ||
          course.maxStudents === undefined ||
          activeEnrollmentCount < course.maxStudents),
    };
  }

  // Count active and completed enrollments when a capacity limit is configured.
  const activeEnrollmentCount =
    course.maxStudents === null || course.maxStudents === undefined
      ? 0
      : await enrollmentModel.countDocuments({
          course: courseId,
          status: { $in: ["ACTIVE", "COMPLETED"] },
        });

  // Determine whether a new enrollment is permitted by course availability and capacity.
  const available =
    course.enrollmentOpen !== false &&
    course.visibility !== "PRIVATE" &&
    (course.maxStudents === null ||
      course.maxStudents === undefined ||
      activeEnrollmentCount < course.maxStudents);

  // Return the enrollment status and whether the learner can enroll.
  return { enrollment: null, canEnroll: available };
}
