import mongoose from "mongoose";

export const ENROLLMENT_STATUSES = Object.freeze([
  "ACTIVE",
  "COMPLETED",
  "WITHDRAWN",
  "SUSPENDED",
]);

const enrollmentSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ENROLLMENT_STATUSES,
      default: "ACTIVE",
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastAccessedLesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      default: null,
    },
    lastAccessedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

enrollmentSchema.index({ learner: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ learner: 1, status: 1, updatedAt: -1 });
enrollmentSchema.index({ course: 1, status: 1 });

const enrollmentModel =
  mongoose.models.Enrollment ??
  mongoose.model("Enrollment", enrollmentSchema);

export default enrollmentModel;
