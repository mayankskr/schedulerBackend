import { Router } from "express";
import { getTeamMembers } from "../controllers/teamController.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";

const router = Router();

// ── All team routes require a user context ─────────────────────
router.use(verifyJWT);

// GET /api/teams/members — all members of the authenticated user's team
//   Returns: id, name, email, role, joined_at, post_count, last_post_status,
//            last_post_at, last_post_type, last_post_platforms[]
router.get("/members", getTeamMembers);

export default router;