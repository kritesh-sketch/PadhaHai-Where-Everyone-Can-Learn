import mongoose from "mongoose";

const LIVE_STATUSES = ["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"];

const LIVE_VISIBILITIES = ["PUBLIC", "ENROLLED_STUDENTS", "PRIVATE"];

const RECORDING_STATUSES = [
  "NOT_STARTED",
  "RECORDING",
  "PROCESSING",
  "READY",
  "FAILED",
];

const liveSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: LIVE_STATUSES,
      default: "SCHEDULED",
      index: true,
    },

    participantLimit: {
      type: Number,
      required: true,
      min: 1,
      default: 50,
    },

    roomId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    visibility: {
      type: String,
      enum: LIVE_VISIBILITIES,
      default: "ENROLLED_STUDENTS",
      index: true,
    },

    isRecordingEnabled: {
      type: Boolean,
      default: false,
    },

    recordingStatus: {
      type: String,
      enum: RECORDING_STATUSES,
      default: "NOT_STARTED",
    },

    chatEnabled: {
      type: Boolean,
      default: true,
    },

    questionsEnabled: {
      type: Boolean,
      default: true,
    },

    allowReplay: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Helps retrieve sessions belonging to a course by scheduled date.
liveSchema.index({ course: 1, scheduledAt: 1 });

// Helps retrieve an instructor's sessions by scheduled date.
liveSchema.index({ instructor: 1, scheduledAt: -1 });

const Live = mongoose.model("Live", liveSchema);

export { LIVE_STATUSES, LIVE_VISIBILITIES, RECORDING_STATUSES };

export default Live;
