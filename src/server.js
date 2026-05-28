import app from "./app.js";
import sequelize from "./config/db.js";
import { initJobs, gracefulShutdown } from "./jobs/index.js";

const PORT = process.env.PORT || 4000;

// FIX (Bug 7): `sequelize.sync({ alter: true })` is unsafe outside local
// development.  In staging or production it introspects the live schema and
// can silently DROP columns or alter constraints that no longer match model
// definitions — causing irreversible data loss.
//
// Rule:
//   - Development  → sync({ alter: true })  convenient auto-migration
//   - Everything else  → sync()  only creates missing tables, never alters
//     existing ones.  Run Sequelize migrations (sequelize db:migrate) for
//     any schema changes in non-dev environments.
const syncOptions = process.env.NODE_ENV === "development"
  ? { alter: true }
  : {};

sequelize
  .sync(syncOptions)
  .then(async () => {
    console.log("✅ Database synced");

    await initJobs(); // start BullMQ worker + any remaining cron jobs

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ DB sync / connection failed:", err.message);
    process.exit(1);
  });

// Graceful shutdown on SIGTERM (PM2, Docker) and SIGINT (Ctrl+C)
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT",  gracefulShutdown);