import { Router } from "express";
import { getTeamMembers } from "../controllers/teamController.js";

const router = Router();

// Uncomment once Phase 3 (auth) is wired:
// import { verifyJWT } from "../middlewares/authMiddleware.js";
// router.use(verifyJWT);

// GET /api/teams/members — team member grid with post stats
router.get("/members", getTeamMembers);

export default router;