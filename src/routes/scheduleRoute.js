import { Router } from "express";
import { getTodaySchedule, getSlots } from "../controllers/scheduleController.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";

const router = Router();

// ── All schedule routes require a user context ─────────────────
router.use(verifyJWT);

// GET /api/schedule/today          — full timeline for today (IST) with Post + User + PostPlatform data
// GET /api/schedule/slots?date=    — occupied + available slots for any YYYY-MM-DD date
router.get("/today", getTodaySchedule);
router.get("/slots", getSlots);

export default router;