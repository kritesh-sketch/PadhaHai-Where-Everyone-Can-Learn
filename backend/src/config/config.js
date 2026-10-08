import dotenv from "dotenv";

dotenv.config();

// Check if MONGODB_URL is defined in the environment variables
if (!process.env.MONGODB_URL) {
  throw new Error("MONGODB_URL is not defined in the environment variables");
}

// Check if JWT_SECRET is defined in the environment variables
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in the environment variables");
}

// Export the configuration object
const config = {
  MONGODB_URL: process.env.MONGODB_URL,
  JWT_SECRET: process.env.JWT_SECRET,
};

export default config;
