import { Router } from "express";

import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

import {
  // Lesson discovery
  getCourseLessons,
  getModuleLessons,
  getLessonById,
  getLessonOverview,
  getLessonNavigation,
  getRelatedLessons,

  // Lesson content
  getLessonContent,
  getLessonVideo,
  getLessonTextContent,
  getLessonResources,
  getLessonAttachments,
  getLessonTranscript,
  getLessonPreview,

  // Lesson activities
  getLessonActivities,
  getLessonActivityById,

  // Lesson navigation
  getNextLesson,
  getPreviousLesson,

  // Instructor lesson management
  createLesson,
  updateLesson,
  deleteLesson,
  publishLesson,
  unpublishLesson,
  reorderLessons,
  moveLesson,
  updateLessonPreview,

  // Instructor content management
  updateLessonContent,
  updateLessonVideo,
  addLessonResource,
  deleteLessonResource,
  addLessonAttachment,
  deleteLessonAttachment,
  updateLessonTranscript,
} from "../modules/lessons/lesson.controller.js";

import {
  // Parameter validation
  validateCourseIdParam,
  validateModuleIdParam,
  validateLessonIdParam,
  validateActivityIdParam,
  validateResourceIdParam,
  validateAttachmentIdParam,

  // Query validation
  validateGetCourseLessonsQuery,
  validateGetModuleLessonsQuery,

  // Body validation
  validateCreateLesson,
  validateUpdateLesson,
  validateReorderLessons,
  validateMoveLesson,
  validateUpdateLessonPreview,
  validateUpdateLessonContent,
  validateUpdateLessonVideo,
  validateAddLessonResource,
  validateAddLessonAttachment,
  validateUpdateLessonTranscript,
} from "../modules/lessons/lesson.validation.js";

const lessonRouter = Router();

/**
 * Adapts a request-data validator to Express middleware.
 */
function validateRequestData(validator, source) {
  return (req, res, next) => {
    const result = validator(req[source] ?? {});

    if (result.errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: result.errors,
      });
    }

    return next();
  };
}

// Validation middleware

const validateCourseId = validateRequestData(validateCourseIdParam, "params");

const validateModuleId = validateRequestData(validateModuleIdParam, "params");

const validateLessonId = validateRequestData(validateLessonIdParam, "params");

const validateActivityId = validateRequestData(
  validateActivityIdParam,
  "params",
);

const validateResourceId = validateRequestData(
  validateResourceIdParam,
  "params",
);

const validateAttachmentId = validateRequestData(
  validateAttachmentIdParam,
  "params",
);

const validateCourseLessonsQuery = validateRequestData(
  validateGetCourseLessonsQuery,
  "query",
);

const validateModuleLessonsQuery = validateRequestData(
  validateGetModuleLessonsQuery,
  "query",
);

const validateCreateLessonBody = validateRequestData(
  validateCreateLesson,
  "body",
);

const validateUpdateLessonBody = validateRequestData(
  validateUpdateLesson,
  "body",
);

const validateReorderLessonsBody = validateRequestData(
  validateReorderLessons,
  "body",
);

const validateMoveLessonBody = validateRequestData(validateMoveLesson, "body");

const validateUpdateLessonPreviewBody = validateRequestData(
  validateUpdateLessonPreview,
  "body",
);

const validateUpdateLessonContentBody = validateRequestData(
  validateUpdateLessonContent,
  "body",
);

const validateUpdateLessonVideoBody = validateRequestData(
  validateUpdateLessonVideo,
  "body",
);

const validateAddLessonResourceBody = validateRequestData(
  validateAddLessonResource,
  "body",
);

const validateAddLessonAttachmentBody = validateRequestData(
  validateAddLessonAttachment,
  "body",
);

const validateUpdateLessonTranscriptBody = validateRequestData(
  validateUpdateLessonTranscript,
  "body",
);

// 1. Learner lesson discovery

lessonRouter.get(
  "/courses/:courseId",
  authenticate,
  authorizeRoles("LEARNER"),
  validateCourseId,
  validateCourseLessonsQuery,
  getCourseLessons,
);

lessonRouter.get(
  "/courses/:courseId/modules/:moduleId/lessons",
  authenticate,
  authorizeRoles("LEARNER"),
  validateModuleId,
  validateModuleLessonsQuery,
  getModuleLessons,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/overview",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonOverview,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/related",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getRelatedLessons,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonById,
);

// 2. Lesson content

lessonRouter.get(
  "/courses/:courseId/:lessonId/preview",
  validateLessonId,
  getLessonPreview,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/content",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonContent,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/video",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonVideo,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/text",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonTextContent,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/resources",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonResources,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/attachments",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonAttachments,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/transcript",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonTranscript,
);

// 3. Lesson activities

lessonRouter.get(
  "/courses/:courseId/:lessonId/activities",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getLessonActivities,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/activities/:activityId",
  authenticate,
  authorizeRoles("LEARNER"),
  validateActivityId,
  getLessonActivityById,
);

// 4. Lesson navigation

lessonRouter.get(
  "/courses/:courseId/:lessonId/next",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getNextLesson,
);

lessonRouter.get(
  "/courses/:courseId/:lessonId/previous",
  authenticate,
  authorizeRoles("LEARNER"),
  validateLessonId,
  getPreviousLesson,
);

// 5. Instructor lesson management

lessonRouter.post(
  "/courses/:courseId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateCourseId,
  validateCreateLessonBody,
  createLesson,
);

lessonRouter.patch(
  "/:lessonId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateUpdateLessonBody,
  updateLesson,
);

lessonRouter.delete(
  "/:lessonId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  deleteLesson,
);

lessonRouter.patch(
  "/:lessonId/publish",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  publishLesson,
);

lessonRouter.patch(
  "/:lessonId/unpublish",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  unpublishLesson,
);

lessonRouter.patch(
  "/courses/:courseId/reorder",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateCourseId,
  validateReorderLessonsBody,
  reorderLessons,
);

lessonRouter.patch(
  "/:lessonId/move",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateMoveLessonBody,
  moveLesson,
);

lessonRouter.patch(
  "/:lessonId/preview",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateUpdateLessonPreviewBody,
  updateLessonPreview,
);

// 6. Instructor lesson content management

lessonRouter.patch(
  "/:lessonId/content",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateUpdateLessonContentBody,
  updateLessonContent,
);

lessonRouter.patch(
  "/:lessonId/video",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateUpdateLessonVideoBody,
  updateLessonVideo,
);

lessonRouter.post(
  "/:lessonId/resources",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateAddLessonResourceBody,
  addLessonResource,
);

lessonRouter.delete(
  "/:lessonId/resources/:resourceId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateResourceId,
  deleteLessonResource,
);

lessonRouter.post(
  "/:lessonId/attachments",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateAddLessonAttachmentBody,
  addLessonAttachment,
);

lessonRouter.delete(
  "/:lessonId/attachments/:attachmentId",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateAttachmentId,
  deleteLessonAttachment,
);

lessonRouter.patch(
  "/:lessonId/transcript",
  authenticate,
  authorizeRoles("INSTRUCTOR"),
  validateLessonId,
  validateUpdateLessonTranscriptBody,
  updateLessonTranscript,
);

export default lessonRouter;
