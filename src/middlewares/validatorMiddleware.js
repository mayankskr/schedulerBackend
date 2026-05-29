import { body, validationResult } from "express-validator";

/**
 * Reads express-validator results and sends a structured 400 if any fail.
 * Must be the LAST item in every validation chain array.
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success:    false,
      statusCode: 400,
      message:    "Validation failed",
      errors:     errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Shared rules ───────────────────────────────────────────────

const captionRule = (optional = false) => {
  const rule = body("caption");
  return (optional ? rule.optional() : rule.notEmpty().withMessage("Caption is required"))
    .isLength({ max: 2200 })
    .withMessage("Caption must be ≤ 2200 characters (Instagram limit)");
};

const keywordsRule = () =>
  body("keywords")
    .optional()
    .custom((value) => {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (!Array.isArray(parsed))         throw new Error("keywords must be an array");
      if (!parsed.every((k) => typeof k === "string"))
        throw new Error("Every keyword must be a string");
      return true;
    });

// BUG 8 FIX: The old `platformsRule` validated a `platforms` field that no
// longer exists on create/update requests — the field is now `accounts`
// (an array of SocialAccount UUIDs).  UUID format validation is handled in
// the service layer against the DB, so no express-validator rule is needed
// here.  The old rule caused no harm (it was optional) but was dead code
// that could confuse future maintainers, so it has been removed from
// validateCreatePost and validateUpdatePost.

const accountsRule = () =>
  body("accounts")
    .optional()
    .custom((value) => {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (!Array.isArray(parsed))   throw new Error("accounts must be an array");
      if (parsed.length === 0)      throw new Error("Select at least one account");
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalid = parsed.filter((id) => !uuidRe.test(id));
      if (invalid.length)
        throw new Error(`Invalid account UUID(s): ${invalid.join(", ")}`);
      return true;
    });

const scheduledAtRule = () =>
  body("scheduled_at")
    .optional()
    .isISO8601()
    .withMessage("scheduled_at must be a valid ISO 8601 datetime")
    .custom((value) => {
      if (new Date(value) <= new Date())
        throw new Error("scheduled_at must be a future datetime");
      return true;
    });

// ── Exported chain arrays ──────────────────────────────────────

/**
 * POST /posts — caption required, everything else optional.
 * BUG 8 FIX: removed platformsRule(), added accountsRule()
 */
export const validateCreatePost = [
  captionRule(false),
  keywordsRule(),
  accountsRule(),     // validates `accounts` UUID array (optional here; service enforces required)
  scheduledAtRule(),
  handleValidationErrors,
];

/**
 * PATCH /posts/:id — all fields optional.
 * BUG 8 FIX: removed platformsRule(), added accountsRule()
 */
export const validateUpdatePost = [
  captionRule(true),
  keywordsRule(),
  accountsRule(),
  scheduledAtRule(),
  handleValidationErrors,
];