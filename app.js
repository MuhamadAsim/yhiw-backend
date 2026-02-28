// app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { createServer } from 'http';
import WebSocketManager from './websocket/server.js';

const app = express();

/* -------------------- Middlewares -------------------- */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Create HTTP server
const server = createServer(app);

// Initialize WebSocket manager
const wsManager = new WebSocketManager(server);

// Make wsManager available to routes
app.set('wsManager', wsManager);

import userAuthRoutes from "./routes/userAuthRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import providerRoutes from "./routes/providerRoutes.js";
import jobRoutes from "./routes/jobRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import websocketRoutes from "./routes/websocketRoutes.js";

app.use("/api/users", userAuthRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/provider", providerRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ws", websocketRoutes); // For WebSocket status endpoints

// WebSocket health check endpoint
app.get("/api/ws/stats", (req, res) => {
  const wsManager = req.app.get('wsManager');
  res.json({
    success: true,
    data: wsManager.getStats()
  });
});

/* -------------------- Health Check -------------------- */
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running 🚀",
  });
});

/* -------------------- Routes -------------------- */
app.get("/", (req, res) => {
  res.send("API is live");
});

/* -------------------- 404 Handler -------------------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/* -------------------- Error Handler -------------------- */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export { server, wsManager };
export default app;