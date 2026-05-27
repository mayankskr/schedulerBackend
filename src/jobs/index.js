import { createPublishWorker } from "./publishPostJob.js";
import { startSlotAllocator  } from "./slotAllocatorJob.js";

let worker;

export const initJobs = async () => {
  worker = createPublishWorker();
  startSlotAllocator();
};

export const gracefulShutdown = async () => {
  console.log("🛑 Shutting down gracefully...");
  if (worker) await worker.close();
  process.exit(0);
};