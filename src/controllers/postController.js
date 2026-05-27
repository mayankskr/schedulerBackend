import { createPostService, deletePostService } from "../services/post.service.js";
import ApiResponse from "../utils/apiResponse.js";
import { AppError, asyncWrap } from "../utils/appError.js";

export const createPost = asyncWrap(async (req, res) => {
  const { caption, keywords, scheduled_at } = req.body;

  if (!req.file) throw new AppError("File is required", 400);

  const post = await createPostService({
    file: req.file,
    caption,
    keywords,
    scheduled_at,
  });

  res.status(201).json(new ApiResponse(201, post, "Post created successfully"));
});

export const deletePost = asyncWrap(async (req, res) => {
  const { id } = req.params;

  const post = await deletePostService(id);

  res.status(200).json(new ApiResponse(200, post, "Post deleted successfully"));
});