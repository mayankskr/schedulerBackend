import { Op } from "sequelize";
import { User, Post, PostPlatform } from "../models/index.js";
import { AppError } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// GET /api/teams/members
// ─────────────────────────────────────────────────────────────────

/**
 * Returns all members of the authenticated user's team, each enriched with:
 *   - post_count        total non-cancelled posts they have created
 *   - last_post_status  status of their most recently scheduled post
 *   - last_post_at      scheduled_at of that post
 *
 * Uses parallel COUNT + findOne per member rather than loading every post
 * row into memory, keeping this query set O(2N) regardless of post volume.
 */
export const getTeamMembersService = async (userId) => {
  // ── Resolve team ──────────────────────────────────────────────
  const currentUser = await User.findByPk(userId, {
    attributes: ["id", "team_id"],
  });
  if (!currentUser)      throw new AppError("User not found", 404);
  if (!currentUser.team_id) throw new AppError("User is not part of a team", 404);

  // ── Load bare member rows ─────────────────────────────────────
  const members = await User.findAll({
    where:      { team_id: currentUser.team_id },
    attributes: ["id", "name", "email", "role", "createdAt"],
    order:      [["name", "ASC"]],
  });

  // ── Enrich each member in parallel ───────────────────────────
  // Promise.all across members, each member fires its two sub-queries
  // in parallel via a nested Promise.all, giving us 2N async calls total
  // without any sequential blocking.
  const enriched = await Promise.all(
    members.map(async (member) => {
      const [postCount, lastPost] = await Promise.all([
        // Count active (non-cancelled) posts
        Post.count({
          where: {
            user_id: member.id,
            status:  { [Op.ne]: "cancelled" },
          },
        }),

        // Most recent post by scheduled_at
        Post.findOne({
          where:      { user_id: member.id },
          order:      [["scheduled_at", "DESC"]],
          attributes: ["id", "status", "file_type", "scheduled_at"],
          include: [
            {
              model:      PostPlatform,
              attributes: ["platform", "publish_status"],
            },
          ],
        }),
      ]);

      return {
        id:               member.id,
        name:             member.name,
        email:            member.email,
        role:             member.role,
        joined_at:        member.createdAt,
        post_count:       postCount,
        last_post_status: lastPost?.status         ?? null,
        last_post_at:     lastPost?.scheduled_at   ?? null,
        last_post_type:   lastPost?.file_type      ?? null,
        last_post_platforms: lastPost?.PostPlatforms?.map((pp) => ({
          platform:       pp.platform,
          publish_status: pp.publish_status,
        })) ?? [],
      };
    })
  );

  return enriched;
};