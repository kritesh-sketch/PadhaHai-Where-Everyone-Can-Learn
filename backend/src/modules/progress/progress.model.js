import mongoose from "mongoose";

const progressSchema = new mongoose.Schema(
  {
    learner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true },
);

progressSchema.index(
  { learner: 1, course: 1, lesson: 1 },
  { unique: true },
);

const progressModel =
  mongoose.models.Progress ?? mongoose.model("Progress", progressSchema);

export default progressModel;