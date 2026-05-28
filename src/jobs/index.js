import { createPublishWorker } from "./publishPostJob.js";

// NOTE (Bug 6 — removed): The original file registered a node-cron job via
// `startSlotAllocator()` that called `seedDailyFirstSlot()` every day at
// 4:00 PM IST.  That function created a ScheduleSlot row with
// `is_occupied: false`, but `nextAvailableSlot` in schedulerService.js only
// queries rows where `is_occupied: true`.  The seeded row was therefore never
// read by the scheduler — the cron job was entirely dead code.
//
// `nextAvailableSlot` already defaults to 4:00 PM IST when no occupied slot
// exists for the day, so no seed is required.  The cron job, its registration,
// and `seedDailyFirstSlot` have all been removed.

let worker;

export const initJobs = async () => {
  worker = createPublishWorker();
};

export const gracefulShutdown = async () => {
  console.log("🛑 Shutting down gracefully...");
  if (worker) await worker.close();
  process.exit(0);
};