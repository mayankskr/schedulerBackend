import { getTeamMembersService } from "../services/teamService.js";
import ApiResponse from "../utils/apiResponse.js";
import { asyncWrap } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// GET /api/teams/members
// ─────────────────────────────────────────────────────────────────

/**
 * Returns all members of the authenticated user's team.
 * Each member includes post count + last post status for the dashboard.
 */
export const getTeamMembers = asyncWrap(async (req, res) => {
  const members = await getTeamMembersService(req.user.id);

  res.status(200).json(
    new ApiResponse(200, members, "Team members fetched")
  );
});