import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { Op } from "sequelize";
import sequelize from "../config/db.js";
import { ScheduleSlot } from "../models/index.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const IST = "Asia/Kolkata";
const SLOT_START_HOUR = 16;       // 4:00 PM
const SLOT_INTERVAL_MIN = 30;

/**
 * Returns the next available slot datetime (IST) for a given date.
 * Defaults to 4:00 PM IST if no slot is occupied yet.
 */
export const nextAvailableSlot = async (date = new Date()) => {
  const targetDate = dayjs(date).tz(IST).format("YYYY-MM-DD");

  const lastSlot = await ScheduleSlot.findOne({
    where: {
      slot_date: targetDate,
      is_occupied: true,
    },
    order: [["slot_time", "DESC"]],
  });

  if (!lastSlot) {
    // No posts today — return 4:00 PM IST
    return dayjs.tz(`${targetDate} ${SLOT_START_HOUR}:00:00`, IST).toDate();
  }

  // Add 30 minutes to the last occupied slot
  const next = dayjs(lastSlot.slot_time)
    .tz(IST)
    .add(SLOT_INTERVAL_MIN, "minute")
    .toDate();

  return next;
};

/**
 * Books a slot for a post.
 * Uses SELECT FOR UPDATE inside a transaction to prevent
 * two concurrent requests grabbing the same slot.
 */
export const bookSlot = async (postId, slotTime) => {
  return await sequelize.transaction(async (t) => {
    const slotDate = dayjs(slotTime).tz(IST).format("YYYY-MM-DD");

    // Prevent collision — lock any row with same slot_time
    const collision = await ScheduleSlot.findOne({
      where: { slot_time: slotTime, is_occupied: true },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (collision) {
      // Another request grabbed this slot concurrently — pick the next one
      const nextTime = dayjs(slotTime)
        .tz(IST)
        .add(SLOT_INTERVAL_MIN, "minute")
        .toDate();

      return await ScheduleSlot.create(
        {
          post_id: postId,
          slot_date: dayjs(nextTime).tz(IST).format("YYYY-MM-DD"),
          slot_time: nextTime,
          is_occupied: true,
        },
        { transaction: t }
      );
    }

    return await ScheduleSlot.create(
      {
        post_id: postId,
        slot_date: slotDate,
        slot_time: slotTime,
        is_occupied: true,
      },
      { transaction: t }
    );
  });
};

/**
 * Frees a slot when a post is deleted or cancelled.
 */
export const freeSlot = async (postId) => {
  const updated = await ScheduleSlot.update(
    { is_occupied: false, post_id: null },
    { where: { post_id: postId } }
  );
  return updated;
};

/**
 * Called by node-cron at 4:00 PM IST.
 * Seeds an empty anchor slot so nextAvailableSlot() has a reference point.
 */
export const seedDailyFirstSlot = async () => {
  const today = dayjs().tz(IST).format("YYYY-MM-DD");
  const firstSlotTime = dayjs
    .tz(`${today} ${SLOT_START_HOUR}:00:00`, IST)
    .toDate();

  const existing = await ScheduleSlot.findOne({
    where: { slot_date: today },
  });

  if (!existing) {
    await ScheduleSlot.create({
      post_id: null,
      slot_date: today,
      slot_time: firstSlotTime,
      is_occupied: false,
    });
    console.log(`✅ Seeded first slot for ${today} at 4:00 PM IST`);
  } else {
    console.log(`ℹ️  Slot already exists for ${today}, skipping seed`);
  }
};