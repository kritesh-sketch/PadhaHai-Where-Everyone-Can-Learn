import mongoose from "mongoose";

export const USER_ROLES = Object.freeze(["LEARNER", "INSTRUCTOR", "ADMIN"]);

export const ACCOUNT_STATUSES = Object.freeze([
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
]);

export const INSTRUCTOR_STATUSES = Object.freeze([
  "NOT_APPLICABLE",
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const EDUCATION_LEVELS = Object.freeze([
  "SCHOOL",
  "HIGHER_SECONDARY",
  "DIPLOMA",
  "BACHELORS",
  "MASTERS",
  "DOCTORATE",
  "OTHER",
]);

export const GENDER_OPTIONS = Object.freeze([
  "MALE",
  "FEMALE",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);

export const THEME_OPTIONS = Object.freeze(["LIGHT", "DARK", "SYSTEM"]);

const userSchema = new mongoose.Schema(
  {
    // Personal Information
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },

    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    gender: {
      type: String,
      enum: GENDER_OPTIONS,
      default: "PREFER_NOT_TO_SAY",
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },

    //Authentication & Security
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    emailVerificationTokenHash: {
      type: String,
      select: false,
    },

    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },

    passwordResetTokenHash: {
      type: String,
      select: false,
    },

    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    // 3. Role & Status information
    role: {
      type: String,
      enum: USER_ROLES,
      default: "LEARNER",
      index: true,
    },

    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "ACTIVE",
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // 4. Profile information
    profilePicture: {
      type: String,
      trim: true,
      default: null,
    },

    coverPhoto: {
      type: String,
      trim: true,
      default: null,
    },

    headline: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    currentPosition: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    location: {
      country: {
        type: String,
        trim: true,
        maxlength: 80,
        default: "",
      },

      city: {
        type: String,
        trim: true,
        maxlength: 80,
        default: "",
      },
    },

    website: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    socialLinks: {
      linkedin: {
        type: String,
        trim: true,
        maxlength: 300,
        default: "",
      },

      github: {
        type: String,
        trim: true,
        maxlength: 300,
        default: "",
      },

      twitter: {
        type: String,
        trim: true,
        maxlength: 300,
        default: "",
      },

      youtube: {
        type: String,
        trim: true,
        maxlength: 300,
        default: "",
      },
    },

    skills: {
      type: [String],
      default: [],
    },

    // 5. Learner & Education Information
    educationLevel: {
      type: String,
      enum: EDUCATION_LEVELS,
      default: null,
    },

    institutionName: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    fieldOfStudy: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    learningGoals: {
      type: [String],
      default: [],
    },

    interests: {
      type: [String],
      default: [],
    },

    preferredLanguage: {
      type: String,
      default: "en",
    },

    // 6. Instructor Information
    qualifications: {
      type: [String],
      default: [],
    },

    specializations: {
      type: [String],
      default: [],
    },

    yearsOfExperience: {
      type: Number,
      min: 0,
      default: 0,
    },

    instructorStatus: {
      type: String,
      enum: INSTRUCTOR_STATUSES,
      default: "NOT_APPLICABLE",
    },

    instructorVerifiedAt: {
      type: Date,
      default: null,
    },

    instructorVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // 7. User Preferences & Notification
    theme: {
      type: String,
      enum: THEME_OPTIONS,
      default: "SYSTEM",
    },

    notificationPreferences: {
      email: {
        type: Boolean,
        default: true,
      },

      courseUpdates: {
        type: Boolean,
        default: true,
      },

      announcements: {
        type: Boolean,
        default: true,
      },

      learningReminders: {
        type: Boolean,
        default: true,
      },
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    // 8. Terms & Privacy
    termsAcceptedAt: {
      type: Date,
      default: null,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },

    suspensionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,

    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;

        // Hide sensitive authentication fields
        delete ret.emailVerificationTokenHash;
        delete ret.emailVerificationExpiresAt;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpiresAt;

        return ret;
      },
    },
  },
);

// Assigning position for First name & Last name
userSchema.index({ firstName: 1 });
userSchema.index({ lastName: 1 });

// Creating rows & column in for storing data
const userModel = mongoose.model("User", userSchema);

export default userModel;
