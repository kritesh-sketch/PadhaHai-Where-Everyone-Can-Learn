import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },

    refreshTokenHash: {
      type: String,
      required: [true, "Refresh token hash is required"],
      unique: true,
    },
    ip: {
      type: String,
    },

    userAgent: {
      type: String,
    },

    revoked: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const sessionModel = mongoose.model("Session", sessionSchema);

export default sessionModel;
