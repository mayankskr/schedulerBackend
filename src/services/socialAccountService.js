// BUG 6 FIX: AppError was thrown in connectAccountService but never imported
import { AppError } from "../utils/appError.js";
import { SocialAccount, User } from "../models/index.js";

// ─────────────────────────────────────────────────────────────────
// GET /api/social-accounts
// ─────────────────────────────────────────────────────────────────

/**
 * Returns all active social accounts for the authenticated user's team,
 * grouped by platform for the frontend account selector.
 *
 * Returns shape: { fb: [{id, label, account_id}, ...], ig: [...], ... }
 */
export const listAccountsService = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError("User not found", 404);

  const accounts = await SocialAccount.findAll({
    where:      { team_id: user.team_id, is_active: true },
    attributes: ["id", "platform", "label", "account_id"],
    order:      [["platform", "ASC"], ["label", "ASC"]],
  });

  // Group by platform — returns {} (empty object) when no accounts exist
  return accounts.reduce((acc, a) => {
    (acc[a.platform] ??= []).push({ id: a.id, label: a.label, account_id: a.account_id });
    return acc;
  }, {});
};

// ─────────────────────────────────────────────────────────────────
// POST /api/social-accounts
// ─────────────────────────────────────────────────────────────────

export const connectAccountService = async (
  userId,
  { platform, label, access_token, refresh_token, account_id },
) => {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError("User not found", 404);

  // BUG 6 FIX: AppError is now imported so this throw will work correctly
  if (user.role !== "admin")
    throw new AppError("Only admins can connect social accounts", 403);

  return SocialAccount.create({
    team_id: user.team_id,
    platform,
    label,
    access_token,
    refresh_token,
    account_id,
  });
};

// ─────────────────────────────────────────────────────────────────
// DELETE /api/social-accounts/:id
// ─────────────────────────────────────────────────────────────────

export const removeAccountService = async (userId, accountId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError("User not found", 404);

  if (user.role !== "admin")
    throw new AppError("Only admins can remove social accounts", 403);

  const account = await SocialAccount.findOne({
    where: { id: accountId, team_id: user.team_id },
  });
  if (!account) throw new AppError("Social account not found", 404);

  // Soft-delete: mark inactive rather than hard deleting (preserves history)
  await account.update({ is_active: false });
  return { id: accountId, message: "Social account removed" };
};