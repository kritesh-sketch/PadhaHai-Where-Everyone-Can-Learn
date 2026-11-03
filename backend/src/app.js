import cookieParser from "cookie-parser";
import express from "express";

import authRouter from "./routes/auth.routes.js";
import enrollmentRouter from "./modules/enrollments/enrollment.route.js";
import adminRouter from "./routes/admin.routes.js";
import catalogRouter from "./routes/catalog.routes.js";
import instructorRouter from "./routes/instructor.routes.js";
import studentRouter from "./routes/learner.routes.js";
import progressRouter from "./routes/progress.routes.js";
import userRouter from "./routes/user.routes.js";
import homeRouter from "./routes/home.routes.js";

import errorHandler from "./middleware/error.middleware.js";
import notFound from "./middleware/not-found.middleware.js";

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/home", homeRouter);
app.use("/api/auth", authRouter);
app.use("/api/enrollments", enrollmentRouter);
app.use("/api/users", userRouter);
app.use("/api/progress", progressRouter);
app.use("/api/learner", studentRouter);
app.use("/api/instructor", instructorRouter);
app.use("/api/admin", adminRouter);
app.use("/api", catalogRouter);

app.use(notFound);
app.use(errorHandler);

export default app;
