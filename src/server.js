import app from "./app.js";
import sequelize from "./config/db.js";
import { initJobs, gracefulShutdown } from "./jobs/index.js";

const PORT = process.env.PORT || 4000;

sequelize
  .sync({ alter: true })
  .then(async () => {
    console.log("✅ Database synced");

    await initJobs(); // start Agenda + node-cron

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed:", err.message);
    process.exit(1);
  });

// Graceful shutdown on SIGTERM (PM2, Docker) and SIGINT (Ctrl+C)
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);