import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import sequelize from "../config/db.js";
import { ScheduleSlot } from "../models/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const IST              = "Asia/Kolkata";
const SLOT_START_HOUR  = 16;   // 4:00 PM
const SLOT_INTERVAL_MIN = 30;
const MAX_SLOT_ATTEMPTS = 10;  // prevents infinite loop; covers 5 hours of slots

/**
 * Returns the next available slot datetime (IST) for a given date.
 * Defaults to 4:00 PM IST if no slot is occupied yet today.
 */
export const nextAvailableSlot = async (date = new Date()) => {
  const targetDate = dayjs(date).tz(IST).format("YYYY-MM-DD");

  const lastSlot = await ScheduleSlot.findOne({
    where: {
      slot_date:   targetDate,
      is_occupied: true,
    },
    order: [["slot_time", "DESC"]],
  });

  if (!lastSlot) {
    // No posts today — start from 4:00 PM IST
    return dayjs.tz(`${targetDate} ${SLOT_START_HOUR}:00:00`, IST).toDate();
  }

  return dayjs(lastSlot.slot_time)
    .tz(IST)
    .add(SLOT_INTERVAL_MIN, "minute")
    .toDate();
};

/**
 * Books a slot for a post.
 *
 * FIX (Bug 3): The original implementation used a single `SELECT … FOR UPDATE`
 * to detect collisions. That lock only applies to *existing* rows — if no row
 * existed at the target slot_time, two concurrent transactions both got `null`,
 * skipped the collision branch, and both created rows at the same slot_time.
 *
 * The fix uses two complementary layers:
 *
 *   1. A retry loop (up to MAX_SLOT_ATTEMPTS): on collision the candidate time
 *      advances by 30 minutes and the whole transaction is retried.
 *
 *   2. A unique index on `slot_time` (see scheduleSlotModel.js): the DB itself
 *      rejects duplicate inserts even under extreme concurrency.  The resulting
 *      SequelizeUniqueConstraintError is caught here and treated the same as a
 *      logical collision — the loop advances to the next slot.
 *
 * FIX (Bug 8): The original code advanced only one slot on collision.  The loop
 * now retries up to MAX_SLOT_ATTEMPTS times, correctly handling bursts where
 * several users submit posts at the exact same moment.
 */
export const bookSlot = async (postId, slotTime) => {
  let candidate = slotTime;

  for (let attempt = 1; attempt <= MAX_SLOT_ATTEMPTS; attempt++) {
    try {
      const slot = await sequelize.transaction(async (t) => {
        const slotDate = dayjs(candidate).tz(IST).format("YYYY-MM-DD");

        // Lock any occupied row at this exact time to prevent a concurrent
        // transaction from also seeing no collision and proceeding.
        const collision = await ScheduleSlot.findOne({
          where:       { slot_time: candidate, is_occupied: true },
          lock:        t.LOCK.UPDATE,
          transaction: t,
        });

        if (collision) {
          // Signal the outer loop to try the next slot
          const err = new Error("SLOT_TAKEN");
          err.code  = "SLOT_TAKEN";
          throw err;
        }

        return await ScheduleSlot.create(
          {
            post_id:     postId,
            slot_date:   slotDate,
            slot_time:   candidate,
            is_occupied: true,
          },
          { transaction: t }
        );
      });

      // Transaction committed successfully
      return slot;

    } catch (err) {
      const isCollision =
        err.code === "SLOT_TAKEN" ||
        err.name === "SequelizeUniqueConstraintError";

      if (isCollision) {
        console.warn(
          `⚠️  Slot collision at ${candidate} (attempt ${attempt}/${MAX_SLOT_ATTEMPTS}) — advancing 30 min`
        );
        candidate = dayjs(candidate)
          .tz(IST)
          .add(SLOT_INTERVAL_MIN, "minute")
          .toDate();
        continue;
      }

      // Unrelated DB error — propagate immediately
      throw err;
    }
  }

  throw new Error(
    `bookSlot: could not secure a free slot after ${MAX_SLOT_ATTEMPTS} attempts starting at ${slotTime}`
  );
};

/**
 * Frees a slot when a post is deleted or cancelled.
 */
export const freeSlot = async (postId) => {
  return await ScheduleSlot.update(
    { is_occupied: false, post_id: null },
    { where: { post_id: postId } }
  );
};

// NOTE (Bug 6 — removed): The original file contained a `seedDailyFirstSlot`
// function called by a node-cron job at 4:00 PM IST.  It created a slot row
// with `is_occupied: false`, but `nextAvailableSlot` only queries rows where
// `is_occupied: true`.  The seeded row was therefore never read by the
// scheduler, making the cron job dead code.
//
// `nextAvailableSlot` already defaults to 4:00 PM IST when no occupied slot
// exists for the day, so no seed is needed.  The cron job and its registration
// in jobs/index.js have been removed.