import mongoose from "mongoose";

/**
 * Defines the schema for authenticated user sessions.
 *
 * Stores session ownership, refresh-token hashes, client metadata,
 * revocation status, and expiration information to support secure
 * session management and token rotation.
 */
const sessionSchema = new mongoose.Schema(
  {
    // References the user who owns this authentication session.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },

    // Stores the hashed refresh token for verification without retaining
    // the original token in the database.
    refreshTokenHash: {
      type: String,
      required: [true, "Refresh token hash is required"],
      unique: true,
    },

    // Records the IP address associated with the session.
    ip: {
      type: String,
    },

    // Records the client user-agent string for session identification.
    userAgent: {
      type: String,
    },

    // Indicates whether the session has been revoked.
    revoked: {
      type: Boolean,
      default: false,
    },

    // Defines when the session expires.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    // Automatically maintains createdAt and updatedAt timestamps.
    timestamps: true,
  },
);

// Automatically removes expired sessions based on their expiration date.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create the Mongoose model used to manage authentication sessions.
const sessionModel = mongoose.model("Session", sessionSchema);

export default sessionModel;
