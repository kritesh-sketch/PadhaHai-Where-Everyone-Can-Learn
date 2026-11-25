import { Router } from "express";
import authenticate from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";

import {
  createReview,
  getMyReviews,
  getReviewById,
  updateReview,
  deleteReview,
  getCourseReviews,
  getCourseRatingSummary,
  markReviewHelpful,
  removeReviewHelpful,
  reportReview,
  getMyReviewReports,
} from "./review.controller.js";

const reviewRouter = Router();

reviewRouter.use(authenticate);
reviewRouter.use(authorizeRoles("LEARNER"));

// My reviews
reviewRouter.get("/my-reviews", getMyReviews);
reviewRouter.get("/my-reviews/published", getMyReviews);
reviewRouter.get("/my-reviews/pending", getMyReviews);
reviewRouter.get("/my-reviews/rejected", getMyReviews);
reviewRouter.get("/my-reviews/drafts", getMyReviews);
reviewRouter.get("/my-reviews/recently-updated", getMyReviews);
reviewRouter.get("/my-reviews/statistics", getMyReviews);

// Course reviews and ratings
reviewRouter.get("/courses/:courseId/ratings", getCourseRatingSummary);
reviewRouter.get("/courses/:courseId", getCourseReviews);

// Create review
reviewRouter.post("/", createReview);

// Helpful votes
reviewRouter.post("/:reviewId/helpful", markReviewHelpful);
reviewRouter.delete("/:reviewId/helpful", removeReviewHelpful);

// Reports
reviewRouter.get("/reports", getMyReviewReports);
reviewRouter.post("/:reviewId/report", reportReview);

// Individual review
reviewRouter.get("/:reviewId", getReviewById);
reviewRouter.patch("/:reviewId", updateReview);
reviewRouter.delete("/:reviewId", deleteReview);

export default reviewRouter;
