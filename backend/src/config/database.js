import mongoose from "mongoose";
import config from "./config.js";

async function connectDB() {
  await mongoose.connect(config.MONGODB_URL);
  console.log("Connected to MongoDB");
}

export default connectDB;
