import mongoose from "mongoose";

export const USER_ROLES = Object.freeze(["LEARNER", "INSTRUCTOR", "ADMIN"]);

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "First Name is required"],
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

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },

    role: {
      type: String,
      enum: USER_ROLES,
      default: "STUDENT",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Profile
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
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

const userModel = mongoose.model("User", userSchema);

export default userModel;
