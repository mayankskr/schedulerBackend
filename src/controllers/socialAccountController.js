import {
  listAccountsService,
  connectAccountService,
  removeAccountService,
} from "../services/socialAccountService.js";
import ApiResponse from "../utils/apiResponse.js";
import { asyncWrap } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// GET /api/social-accounts
// ─────────────────────────────────────────────────────────────────

export const listAccounts = asyncWrap(async (req, res) => {
  const accounts = await listAccountsService(req.user.id);
  res.status(200).json(new ApiResponse(200, accounts, "Social accounts fetched"));
});

// ─────────────────────────────────────────────────────────────────
// POST /api/social-accounts
// ─────────────────────────────────────────────────────────────────

export const connectAccount = asyncWrap(async (req, res) => {
  const { platform, label, access_token, refresh_token, account_id } = req.body;
  const account = await connectAccountService(req.user.id, {
    platform,
    label,
    access_token,
    refresh_token,
    account_id,
  });
  res.status(201).json(new ApiResponse(201, account, "Social account connected"));
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/social-accounts/:id
// ─────────────────────────────────────────────────────────────────

export const removeAccount = asyncWrap(async (req, res) => {
  const result = await removeAccountService(req.user.id, req.params.id);
  res.status(200).json(new ApiResponse(200, result, "Social account removed"));
});