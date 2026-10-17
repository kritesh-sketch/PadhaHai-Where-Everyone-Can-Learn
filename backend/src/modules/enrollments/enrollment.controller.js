import {
  enrollLearner,
  EnrollmentError,
  completeLesson,
  getLearnerEnrollmentStatus,
  listCourseEnrollments,
  listLearnerEnrollments,
  setEnrollmentSuspension,
  updateEnrollmentAccess,
  withdrawEnrollment,
} from "./enrollment.service.js";
import {
  parseAdministrativeStatusInput,
  validateEmptyEnrollmentBody,
} from "./enrollment.validation.js";

function handleError(error, res, next) {
  // Return a structured HTTP response when the error is an enrollment-specific error.
  if (error instanceof EnrollmentError) {
    return res.status(error.statusCode).json({
      message: error.message,
      // Include validation details only when additional error information is available.
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  // Forward unhandled errors to the centralized error-handling middleware.
  return next(error);
}

/**
 * Creates an enrollment for the authenticated learner.
 *
 * Validates the enrollment request body, processes the enrollment,
 * and returns the enrollment details with the appropriate HTTP status.
 *
 * @param {Object} req - The request object containing the authenticated user and course ID.
 * @param {Object} res - The response object used to return the enrollment result.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The enrollment response or the result of error forwarding.
 */
export async function createEnrollment(req, res, next) {
  try {
    // Reject request bodies containing client-controlled learner or status fields.
    if (!validateEmptyEnrollmentBody(req.body ?? {})) {
      return res.status(400).json({
        message: "Enrollment request must not contain learner or status fields",
      });
    }

    // Create or reactivate the enrollment for the authenticated learner.
    const result = await enrollLearner(req.user, req.params.courseId);

    // Return 201 for a new enrollment or 200 for an existing enrollment.
    return res.status(result.created ? 201 : 200).json({
      enrollment: result.enrollment,
      reactivated: result.reactivated,
    });
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Retrieves the authenticated learner's enrollments.
 *
 * Passes the request query parameters to the enrollment service to support
 * filtering or pagination and returns the matching enrollment records.
 *
 * @param {Object} req - The request object containing the authenticated user and query parameters.
 * @param {Object} res - The response object used to return the enrollment records.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The enrollment records or the result of error forwarding.
 */
export async function listMyEnrollments(req, res, next) {
  try {
    // Retrieve the authenticated learner's enrollments using the supplied query parameters.
    const result = await listLearnerEnrollments(req.user, req.query);

    // Return the enrollment records and associated metadata.
    return res.json(result);
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Retrieves the authenticated learner's enrollment status for a course.
 *
 * Uses the course ID from the request parameters to determine the learner's
 * current enrollment status and returns the result.
 *
 * @param {Object} req - The request object containing the authenticated user and course ID.
 * @param {Object} res - The response object used to return the enrollment status.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The enrollment status or the result of error forwarding.
 */
export async function getMyCourseEnrollmentStatus(req, res, next) {
  try {
    // Retrieve the authenticated learner's enrollment status for the specified course.
    const result = await getLearnerEnrollmentStatus(
      req.user,
      req.params.courseId,
    );

    // Return the enrollment status and associated details.
    return res.json(result);
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Retrieves the enrollments for a specific course.
 *
 * Uses the course ID and query parameters to retrieve enrollment records
 * available to the authenticated instructor or authorized user.
 *
 * @param {Object} req - The request object containing the authenticated user, course ID, and query parameters.
 * @param {Object} res - The response object used to return the course enrollments.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The course enrollment records or the result of error forwarding.
 */
export async function getCourseEnrollments(req, res, next) {
  try {
    // Retrieve the course enrollments using the authenticated user, course ID, and query parameters.
    const result = await listCourseEnrollments(
      req.user,
      req.params.courseId,
      req.query,
    );

    // Return the enrollment records and associated metadata.
    return res.json(result);
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Records a learner's access to a course lesson.
 *
 * Uses the course and lesson IDs to update the authenticated learner's
 * enrollment access information and returns the updated result.
 *
 * @param {Object} req - The request object containing the authenticated user, course ID, and lesson ID.
 * @param {Object} res - The response object used to return the updated enrollment information.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated enrollment information or the result of error forwarding.
 */
export async function recordLessonAccess(req, res, next) {
  try {
    // Update the authenticated learner's lesson access information.
    const result = await updateEnrollmentAccess(
      req.user,
      req.params.courseId,
      req.params.lessonId,
    );

    // Return the updated enrollment information.
    return res.json(result);
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Marks a course lesson as completed by the authenticated learner.
 *
 * Uses the course and lesson IDs to update the learner's completion status
 * and returns the updated enrollment information.
 *
 * @param {Object} req - The request object containing the authenticated user, course ID, and lesson ID.
 * @param {Object} res - The response object used to return the updated enrollment information.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated enrollment information or the result of error forwarding.
 */
export async function markLessonCompleted(req, res, next) {
  try {
    // Mark the specified lesson as completed for the authenticated learner.
    const result = await completeLesson(
      req.user,
      req.params.courseId,
      req.params.lessonId,
    );

    // Return the updated enrollment information.
    return res.json(result);
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Updates the administrative status of an enrollment.
 *
 * Validates the requested status before applying the administrative
 * change to the specified enrollment.
 *
 * @param {Object} req - The request object containing the authenticated user, enrollment ID, and status data.
 * @param {Object} res - The response object used to return the updated enrollment or validation errors.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated enrollment, a validation error response, or the result of error forwarding.
 */
export async function updateEnrollmentStatus(req, res, next) {
  // Validate the requested administrative status before processing the update.
  const parsed = parseAdministrativeStatusInput(req.body ?? {});

  // Reject the request if the status input fails validation.
  if (parsed.errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.errors,
    });
  }

  try {
    // Apply the validated status change to the specified enrollment.
    const enrollment = await setEnrollmentSuspension(
      req.user,
      req.params.enrollmentId,
      parsed.status,
    );

    // Return the updated enrollment record.
    return res.json({ enrollment });
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}

/**
 * Withdraws the authenticated learner from an enrollment.
 *
 * Uses the enrollment ID to process the learner's withdrawal
 * and returns the updated enrollment record.
 *
 * @param {Object} req - The request object containing the authenticated user and enrollment ID.
 * @param {Object} res - The response object used to return the updated enrollment.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The updated enrollment or the result of error forwarding.
 */
export async function withdrawMyEnrollment(req, res, next) {
  try {
    // Process the authenticated learner's withdrawal from the specified enrollment.
    const enrollment = await withdrawEnrollment(
      req.user,
      req.params.enrollmentId,
    );

    // Return the updated enrollment record.
    return res.json({ enrollment });
  } catch (error) {
    // Handle enrollment-specific errors and forward unexpected errors.
    return handleError(error, res, next);
  }
}
