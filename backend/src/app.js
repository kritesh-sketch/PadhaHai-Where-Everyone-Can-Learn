import cookieParser from "cookie-parser";
import express from "express";
import authRouter from "./routes/auth.routes.js";
import adminRouter from "./routes/admin.routes.js";
import catalogRouter from "./routes/catalog.routes.js";
import instructorRouter from "./routes/instructor.routes.js";
import studentRouter from "./routes/student.routes.js";
import errorHandler from "./modules/middleware/error.middleware.js";
import notFound from "./modules/middleware/not-found.middleware.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/student", studentRouter);
app.use("/api/instructor", instructorRouter);
app.use("/api/admin", adminRouter);
app.use("/api", catalogRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
