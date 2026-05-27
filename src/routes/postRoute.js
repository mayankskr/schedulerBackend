import { Router } from "express";
import {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
} from "../controllers/postController.js";
import { upload }              from "../middlewares/multerMiddleware.js";
import {
  validateCreatePost,
  validateUpdatePost,
}                              from "../middlewares/validatorMiddleware.js";
import { postRateLimiter }     from "../middlewares/rateLimitMiddleware.js";

const router = Router();

// ── All post routes require authentication ─────────────────────
// Uncomment once Phase 3 (auth) is wired:
// import { verifyJWT } from "../middlewares/authMiddleware.js";
// router.use(verifyJWT);

// ─────────────────────────────────────────────────────────────────
// GET  /api/posts          — list (paginated, filterable)
// GET  /api/posts/:id      — single post with platform statuses
// POST /api/posts          — create + schedule  (multipart/form-data)
// PATCH /api/posts/:id     — partial edit       (multipart/form-data)
// DELETE /api/posts/:id    — soft-delete
// ─────────────────────────────────────────────────────────────────

router.get("/"    , getPosts);
router.get("/:id" , getPost);

router.post(
  "/",
  postRateLimiter,           // 30 req/hr per user
  upload.single("file"),     // Multer: memoryStorage, MIME filter
  validateCreatePost,        // express-validator chain
  createPost
);

router.patch(
  "/:id",
  upload.single("file"),     // file is optional on PATCH
  validateUpdatePost,
  updatePost
);

router.delete("/:id", deletePost);

export default router;