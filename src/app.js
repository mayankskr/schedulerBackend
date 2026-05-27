// Import packages and other files
import express from "express";
import cors from "cors";
import "dotenv/config";
import { sequelize } from "./models/index.js";
import cookieParser from "cookie-parser";

// Create app
const app = express();

// Middleware
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.get("/", (req, res) => res.json({ message: "API running" }));

// Routes Import
import postRouter from "./routes/postRoutes.js";

// Route use
app.use("/api/posts", postRouter);

export default app;
