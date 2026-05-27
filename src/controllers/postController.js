import {
  createPostService,
  getPostsService,
  getPostService,
  updatePostService,
  deletePostService,
} from "../services/postService.js";
import ApiResponse from "../utils/apiResponse.js";
import { AppError, asyncWrap } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// POST /api/posts
// ─────────────────────────────────────────────────────────────────

export const createPost = asyncWrap(async (req, res) => {
  if (!req.file) throw new AppError("File is required", 400);

  const { caption, keywords, scheduled_at, platforms } = req.body;

  const post = await createPostService({
    file: req.file,
    caption,
    keywords,
    platforms,
    scheduled_at,
    userId: req.user.id,
  });

  res.status(201).json(new ApiResponse(201, post, "Post created and scheduled"));
});

// ─────────────────────────────────────────────────────────────────
// GET /api/posts
// ─────────────────────────────────────────────────────────────────

export const getPosts = asyncWrap(async (req, res) => {
  const { page, limit, status, platform } = req.query;

  const result = await getPostsService(req.user.id, { page, limit, status, platform });

  res.status(200).json(new ApiResponse(200, result, "Posts fetched"));
});

// ─────────────────────────────────────────────────────────────────
// GET /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const getPost = asyncWrap(async (req, res) => {
  const post = await getPostService(req.params.id);

  res.status(200).json(new ApiResponse(200, post, "Post fetched"));
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const updatePost = asyncWrap(async (req, res) => {
  const { caption, keywords, platforms, scheduled_at } = req.body;

  const post = await updatePostService({
    postId:       req.params.id,
    file:         req.file, // undefined when no new file is attached
    caption,
    keywords,
    platforms,
    scheduled_at,
    userId:       req.user.id,
  });

  res.status(200).json(new ApiResponse(200, post, "Post updated"));
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const deletePost = asyncWrap(async (req, res) => {
  const result = await deletePostService(req.params.id, req.user.id);

  res.status(200).json(new ApiResponse(200, result, "Post deleted"));
});