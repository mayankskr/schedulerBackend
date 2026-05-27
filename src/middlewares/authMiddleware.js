import { User } from "../models/index.js";
import { AppError, asyncWrap } from "../utils/appError.js";

/**
 * Auth bypass middleware — no JWT verification.
 *
 * Resolution order:
 *   1. x-user-id header → look up that specific user
 *   2. No header        → attach the first user found in DB
 *   3. No users at all  → 404 with a clear message
 *
 * Replace this entire file with real JWT verification when Phase 3 is added.
 */
export const verifyJWT = asyncWrap(async (req, res, next) => {
  const userId = req.headers["x-user-id"];

  let user;

  if (userId) {
    user = await User.findByPk(userId, {
      attributes: ["id", "name", "email", "role", "team_id"],
    });
    if (!user) {
      throw new AppError(`User with id "${userId}" not found`, 404);
    }
  } else {
    // No header supplied — fall back to first user in DB for dev/testing
    user = await User.findOne({
      attributes: ["id", "name", "email", "role", "team_id"],
      order: [["createdAt", "ASC"]],
    });
    if (!user) {
      throw new AppError(
        "No users found in the database. " +
          "POST /api/auth/register to create one, or seed the DB first.",
        404
      );
    }
  }

  req.user = user;
  next();
});