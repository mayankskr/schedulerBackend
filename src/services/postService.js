import Post from "../models/postModel.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

export const createPostService = async ({ file, caption, keywords, scheduled_at }) => {
  const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
    folder: "postscheduler",
  });

  if (!cloudinaryResponse) throw new Error("Cloudinary upload failed");

  const post = await Post.create({
    user_id: "temp-user-id", // replace with req.user.id after auth
    cloudinary_url: cloudinaryResponse.secure_url,
    cloudinary_public_id: cloudinaryResponse.public_id,
    file_type: file.mimetype.split("/")[0],
    caption,
    keywords: keywords ? JSON.parse(keywords) : [],
    scheduled_at,
    status: "draft",
  });

  return post;
};

export const deletePostService = async (postId) => {
  const post = await Post.findByPk(postId);
  if (!post) throw new Error("Post not found");

  await deleteFromCloudinary(post.cloudinary_public_id, post.file_type);
  await post.destroy();

  return post;
};