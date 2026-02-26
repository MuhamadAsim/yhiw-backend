import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import { deleteAllUsers, printAllUsers } from "./controllers/userAuthController.js";


dotenv.config();

const PORT = process.env.PORT || 5000;

/* -------------------- Start Server -------------------- */
const startServer = async () => {
  await connectDB();
      // ⚠️ This will run automatically on server start
    await printAllUsers(); 
    
    // 🚨 EXTREMELY DANGEROUS
    await deleteAllUsers();  


  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });

  /* -------------------- Graceful Shutdown -------------------- */
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err);
    server.close(() => process.exit(1));
  });
};

startServer();
