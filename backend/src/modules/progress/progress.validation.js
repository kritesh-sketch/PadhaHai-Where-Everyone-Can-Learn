const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function parseContinueLearningQuery(query = {}) {
  const errors = [];
  const page = query.page === undefined ? DEFAULT_PAGE : Number(query.page);
  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);

  if (
    (query.page !== undefined &&
      (typeof query.page !== "string" || !/^[1-9]\d*$/.test(query.page))) ||
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    errors.push({ field: "page", message: "Must be a positive integer" });
  }

  if (
    (query.limit !== undefined &&
      (typeof query.limit !== "string" || !/^[1-9]\d*$/.test(query.limit))) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT
  ) {
    errors.push({
      field: "limit",
      message: `Must be an integer from 1 to ${MAX_LIMIT}`,
    });
  }

  return { page, limit, errors };
}

export function validateContinueLearningQuery(req, res, next) {
  const parsed = parseContinueLearningQuery(req.query);
  if (parsed.errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors: parsed.errors,
    });
  }

  req.continueLearningPagination = {
    page: parsed.page,
    limit: parsed.limit,
  };
  return next();
}
