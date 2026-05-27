import { body, validationResult } from "express-validator";

const VALID_PLATFORMS = ["fb", "ig", "yt", "tw"];

/**
 * Reads express-validator results and sends a structured 400 if any fail.
 * Must be the LAST item in every validation chain array.
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Shared rules (reused across create + update) ───────────────

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
      if (!Array.isArray(parsed)) throw new Error("keywords must be an array");
      if (!parsed.every((k) => typeof k === "string"))
        throw new Error("Every keyword must be a string");
      return true;
    });

const platformsRule = () =>
  body("platforms")
    .optional()
    .custom((value) => {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (!Array.isArray(parsed)) throw new Error("platforms must be an array");
      const invalid = parsed.filter((p) => !VALID_PLATFORMS.includes(p));
      if (invalid.length)
        throw new Error(`Invalid platform(s): ${invalid.join(", ")}. Valid: ${VALID_PLATFORMS.join(", ")}`);
      if (parsed.length === 0)
        throw new Error("At least one platform must be selected");
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
 * Validation for POST /posts
 * caption is required; everything else is optional.
 */
export const validateCreatePost = [
  captionRule(false),
  keywordsRule(),
  platformsRule(),
  scheduledAtRule(),
  handleValidationErrors,
];

/**
 * Validation for PATCH /posts/:id
 * All fields optional — only validate what is present.
 */
export const validateUpdatePost = [
  captionRule(true),
  keywordsRule(),
  platformsRule(),
  scheduledAtRule(),
  handleValidationErrors,
];