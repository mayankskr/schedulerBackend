import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import "dotenv/config";

const app = express();

// ── Security & logging ─────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// ── CORS ───────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// ── Health check ───────────────────────────────────────────────
app.get("/", (req, res) => res.json({ message: "API running" }));

// ── Routes ─────────────────────────────────────────────────────
import postRouter     from "./routes/postRoute.js";
import scheduleRouter from "./routes/scheduleRoute.js";
import teamRouter     from "./routes/teamRoute.js";

app.use("/api/posts",    postRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/teams",    teamRouter);

// ── Global error handler — must be last ───────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const message    = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;