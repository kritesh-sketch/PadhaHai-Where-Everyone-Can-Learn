// for showing user popular courses other users are enrolling in it.
export async function listPopularCourses(req, res, next) {
  try {
    // Set the default limit to 8 and restrict the maximum number of results to 20.
    const limit = 9;

    // Sort by popularity and creation date, and return the top courses.
    const courses = await courseModel.aggregate([
      { $match: { status: "PUBLISHED" } },
      {
        $lookup: {
          from: "enrollments", // Actual MongoDB collection name for enrollments
          localField: "_id",
          foreignField: "course", // Enrollment field referencing the course
          as: "enrollments",
        },
      },
      { $addFields: { enrollmentCount: { $size: "$enrollments" } } },
      { $project: { enrollments: 0 } },
      { $sort: { enrollmentCount: -1, createdAt: -1 } },
      { $limit: limit },
    ]);

    // Populate category and instructor details with only the required fields.
    await courseModel.populate(courses, [
      // Populate the course category with its name and slug.
      { path: "category", select: "name slug" },

      // Populate the course instructor with basic profile information.
      { path: "instructor", select: "firstName lastName username" },
    ]);

    return res.json({ courses });
  } catch (error) {
    return next(error);
  }
}
