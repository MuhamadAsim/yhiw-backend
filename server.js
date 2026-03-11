import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { printAllUsers } from "./controllers/userAuthController.js";

dotenv.config();

const PORT = 4000;

/* -------------------- Start Server -------------------- */
const startServer = async () => {
  await connectDB();
  await printAllUsers(); 

  app.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on http://localhost:${PORT}`);
  });

  /* -------------------- Graceful Shutdown -------------------- */
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    process.exit(1);
  });
};

startServer();