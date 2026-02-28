// server.js
import dotenv from "dotenv";
import { server } from "./app.js";
import connectDB from "./config/db.js";
import { printAllUsers } from "./controllers/userAuthController.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

/* -------------------- Start Server -------------------- */
const startServer = async () => {
  await connectDB();
  await printAllUsers(); // Optional

  server.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket Server running on ws://localhost:${PORT}`);
  });

  /* -------------------- Graceful Shutdown -------------------- */
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    server.close(() => process.exit(1));
  });
};

startServer();