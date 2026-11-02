import {
  getLearningProgressSummary,
  listContinueLearning,
  ProgressError,
} from "../progress/progress.service.js";
import { getExploreCategories } from "../categories/category.service.js";
import {
  getPopularCourses,
  getRecommendedCourses,
} from "./home.service.js";

export async function getContinueLearning(req, res, next) {
  try {
    const result = await listContinueLearning(
      req.user,
      req.continueLearningPagination,
    );

    return res.json(result);
  } catch (error) {
    if (error instanceof ProgressError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return next(error);
  }
}

export async function getRecommendedForYou(req, res, next) {
  try {
    const result = await getRecommendedCourses(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Recommended courses retrieved successfully",
      data: result.courses,
      pagination: result.pagination,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Retrieve homepage content for the authenticated learner.
 *
 * @route GET /api/home
 * @access LEARNER
 */
export async function getHome(req, res, next) {
  try {
    const [
      continueLearning,
      learningProgress,
      categories,
      recommendations,
      popularCourses,
    ] = await Promise.all([
      listContinueLearning(req.user, req.continueLearningPagination),
      getLearningProgressSummary(req.user),
      getExploreCategories(),
      getRecommendedCourses(req.user, req.query),
      getPopularCourses(req.query),
    ]);

    return res.status(200).json({
      success: true,
      message: "Home data retrieved successfully.",
      data: {
        continueLearning: continueLearning.courses,
        learningProgress,
        recommendedCourses: recommendations.courses,
        popularCourses: popularCourses.courses,
        showPopularCourses: popularCourses.showSection,
        categories,
      },
      pagination: {
        continueLearning: continueLearning.pagination,
        recommendedCourses: recommendations.pagination,
      },
    });
  } catch (error) {
    if (error instanceof ProgressError) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    return next(error);
  }
}
