import dayjs from "dayjs";
import utc      from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { ScheduleSlot, Post, PostPlatform, User } from "../models/index.js";
import ApiResponse from "../utils/apiResponse.js";
import { AppError, asyncWrap } from "../utils/appError.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const IST         = "Asia/Kolkata";
const DATE_REGEX  = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

// ─────────────────────────────────────────────────────────────────
// Shared include config
// ─────────────────────────────────────────────────────────────────

const fullSlotInclude = [
  {
    model:    Post,
    required: false, // LEFT JOIN — return empty slots too
    include: [
      { model: User,         attributes: ["id", "name", "email"] },
      { model: PostPlatform, attributes: ["platform", "publish_status", "platform_post_id", "error_message"] },
    ],
  },
];

const lightSlotInclude = [
  {
    model:    Post,
    required: false,
    attributes: ["id", "status", "caption", "file_type", "scheduled_at"],
    include:  [{ model: User, attributes: ["id", "name"] }],
  },
];

// ─────────────────────────────────────────────────────────────────
// GET /api/schedule/today
// ─────────────────────────────────────────────────────────────────

/**
 * Returns every ScheduleSlot for today (IST) joined with Post + User + PostPlatforms.
 * Powers the team dashboard timeline view.
 * Both occupied and empty slots are included so the frontend can render the
 * full 4:00 PM … timeline including gaps.
 */
export const getTodaySchedule = asyncWrap(async (req, res) => {
  const today = dayjs().tz(IST).format("YYYY-MM-DD");

  const slots = await ScheduleSlot.findAll({
    where:   { slot_date: today },
    include: fullSlotInclude,
    order:   [["slot_time", "ASC"]],
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date:       today,
        timezone:   IST,
        slot_count: slots.length,
        occupied:   slots.filter((s) => s.is_occupied).length,
        available:  slots.filter((s) => !s.is_occupied).length,
        slots,
      },
      "Today's schedule fetched"
    )
  );
});

// ─────────────────────────────────────────────────────────────────
// GET /api/schedule/slots?date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────

/**
 * Returns all slots for a given IST date.
 * Defaults to today when no date is supplied.
 *
 * Query params:
 *   date {string}  YYYY-MM-DD  — must be a valid calendar date
 */
export const getSlots = asyncWrap(async (req, res) => {
  // ── Validate and normalise the date param ─────────────────────
  let targetDate = req.query.date;

  if (targetDate) {
    if (!DATE_REGEX.test(targetDate)) {
      throw new AppError("Invalid date format. Use YYYY-MM-DD.", 400);
    }
    // Confirm dayjs can parse it into a real calendar date
    const parsed = dayjs.tz(targetDate, IST);
    if (!parsed.isValid()) {
      throw new AppError("Invalid date value.", 400);
    }
    targetDate = parsed.format("YYYY-MM-DD"); // normalise
  } else {
    targetDate = dayjs().tz(IST).format("YYYY-MM-DD");
  }

  // ── Query ─────────────────────────────────────────────────────
  const slots = await ScheduleSlot.findAll({
    where:   { slot_date: targetDate },
    include: lightSlotInclude,
    order:   [["slot_time", "ASC"]],
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        date:       targetDate,
        timezone:   IST,
        slot_count: slots.length,
        occupied:   slots.filter((s) => s.is_occupied).length,
        available:  slots.filter((s) => !s.is_occupied).length,
        slots,
      },
      "Schedule slots fetched"
    )
  );
});