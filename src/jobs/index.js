import agenda from "../config/agenda.js";
import "./publishPostJob.js"; // registers the job definition with agenda
import { startSlotAllocator } from "./slotAllocatorJob.js";

/**
 * Starts Agenda and all cron jobs.
 * Call this once in server.js after DB sync.
 */
export const initJobs = async () => {
  await agenda.start();
  console.log("✅ Agenda started");

  startSlotAllocator();
};

/**
 * Graceful shutdown — lets running jobs finish before exit.
 */
export const gracefulShutdown = async () => {
  await agenda.stop();
  console.log("🛑 Agenda stopped gracefully");
  process.exit(0);
};