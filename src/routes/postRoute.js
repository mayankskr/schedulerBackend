import { Router } from "express";
import {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
} from "../controllers/postController.js";
import { upload } from "../middlewares/multerMiddleware.js";
import {
  validateCreatePost,
  validateUpdatePost,
} from "../middlewares/validatorMiddleware.js";
import { postRateLimiter } from "../middlewares/rateLimitMiddleware.js";
import { verifyJWT } from "../middlewares/authMiddleware.js";

const router = Router();

// ── All post routes require a user context ─────────────────────
// verifyJWT attaches req.user (bypass mode — no JWT needed right now)
router.use(verifyJWT);

// ─────────────────────────────────────────────────────────────────
// GET  /api/posts          — list (paginated, filterable by status / platform)
// GET  /api/posts/:id      — single post with per-platform statuses
// POST /api/posts          — create + schedule  (multipart/form-data)
// PATCH /api/posts/:id     — partial edit       (multipart/form-data)
// DELETE /api/posts/:id    — soft-delete (status → "cancelled")
// ─────────────────────────────────────────────────────────────────

router.get("/", getPosts);
router.get("/:id", getPost);

router.post(
  "/",
  postRateLimiter,        // 30 req/hr per user (keyed by req.user.id)
  upload.single("file"),  // Multer memoryStorage — MIME filter applied
  validateCreatePost,     // express-validator: caption required, platforms valid, etc.
  createPost
);

router.patch(
  "/:id",
  upload.single("file"),  // file is optional on PATCH
  validateUpdatePost,     // all fields optional — validates only what is present
  updatePost
);

router.delete("/:id", deletePost);

export default router;