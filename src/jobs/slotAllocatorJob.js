import cron from "node-cron";
import { seedDailyFirstSlot } from "../services/schedulerService.js";

/**
 * Runs at exactly 4:00 PM IST every day.
 * Seeds the anchor slot so the scheduler has a starting point.
 * TZ=Asia/Kolkata in .env ensures node-cron resolves this correctly.
 */
export const startSlotAllocator = () => {
  cron.schedule(
    "0 16 * * *",
    async () => {
      console.log("⏰ Slot allocator triggered — seeding daily slot...");
      try {
        await seedDailyFirstSlot();
      } catch (err) {
        console.error("❌ Slot allocator failed:", err.message);
      }
    },
    {
      timezone: "Asia/Kolkata", // belt-and-suspenders alongside TZ env var
    }
  );

  console.log("✅ Slot allocator cron registered (daily @ 4:00 PM IST)");
};