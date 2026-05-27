import { Router } from "express";
import { getTodaySchedule, getSlots } from "../controllers/scheduleController.js";

const router = Router();

// Uncomment once Phase 3 (auth) is wired:
// import { verifyJWT } from "../middlewares/authMiddleware.js";
// router.use(verifyJWT);

// GET /api/schedule/today          — full timeline for today (IST)
// GET /api/schedule/slots?date=    — occupied + available slots for any date
router.get("/today", getTodaySchedule);
router.get("/slots", getSlots);

export default router;