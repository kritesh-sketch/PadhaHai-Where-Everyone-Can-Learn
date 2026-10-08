import app from "./src/app.js";
import connectDB from "./src/config/database.js";

await connectDB();

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
