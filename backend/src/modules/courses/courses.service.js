const MIN_TRENDING_COURSES = 8;

/**
 * Retrieves the most popular published courses for the trending section.
 *
 * Ranks courses by enrollment count, using creation date as a secondary
 * sorting criterion. Populates category and instructor details and hides
 * the trending section when fewer than the required minimum courses exist.
 *
 * @param {Object} req - The request object containing the optional result limit.
 * @param {Object} res - The response object used to return trending courses and section visibility.
 * @param {Function} next - The middleware function for forwarding unhandled errors.
 * @returns {Promise<Object|void>} The trending course response or the result of error forwarding.
 */
export async function trendingCourses(req, res, next) {
  try {
    // Default to 8 courses and constrain the requested limit to the range of 1–20.
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      20,
    );

    // Retrieve published courses, calculate their enrollment counts, and rank the most popular first.
    const courses = await courseModel.aggregate([
      // Exclude courses that are not publicly published.
      {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        isDeleted: false,
      },

      // Join enrollment records associated with each course.
      {
        $lookup: {
          from: "enrollments", // MongoDB collection name for enrollment records.
          localField: "_id",
          foreignField: "course", // Enrollment field referencing the course ID.
          as: "enrollments",
        },
      },

      // Calculate the total number of enrollment records for each course.
      { $addFields: { enrollmentCount: { $size: "$enrollments" } } },

      // Remove the joined enrollment documents to keep the response lightweight.
      { $project: { enrollments: 0 } },

      // Rank courses by enrollment count, breaking ties with the newest courses first.
      { $sort: { enrollmentCount: -1, createdAt: -1 } },

      // Return only the requested number of top-ranked courses.
      { $limit: limit },
    ]);

    // Hide the trending section when there are not enough courses to display it meaningfully.
    if (courses.length < MIN_TRENDING_COURSES) {
      return res.status(200).json({ courses: [], showSection: false });
    }

    // Populate related category and instructor details for frontend display.
    await courseModel.populate(courses, [
      // Include only the category name and slug.
      { path: "category", select: "name slug" },

      // Include only the instructor's basic profile information.
      { path: "instructor", select: "firstName lastName username" },
    ]);

    // Return the ranked courses for display in the trending section.
    return res.status(200).json({
      courses,
      showSection: true,
    });
  } catch (error) {
    // Forward database and unexpected errors to centralized error-handling middleware.
    return next(error);
  }
}
