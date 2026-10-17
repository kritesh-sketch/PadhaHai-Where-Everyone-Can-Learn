import {
  listContinueLearning,
  ProgressError,
} from "./progress.service.js";

export async function getContinueLearning(req, res, next) {
  try {
    const result = await listContinueLearning(
      req.user,
      req.continueLearningPagination,
    );
    return res.json(result);
  } catch (error) {
    if (error instanceof ProgressError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
}
