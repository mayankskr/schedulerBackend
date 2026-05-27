import { Post, PostPlatform } from "../models/index.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { nextAvailableSlot, bookSlot, freeSlot } from "./schedulerService.js";
import agenda from "../config/agenda.js";
import { AppError } from "../utils/appError.js";

const VALID_PLATFORMS = ["fb", "ig", "yt", "tw"];

const parsePlatforms = (platforms) => {
  if (Array.isArray(platforms)) return platforms;
  if (typeof platforms === "string") {
    try {
      return JSON.parse(platforms);
    } catch {
      return [platforms];
    }
  }
  return VALID_PLATFORMS; // default: all 4
};

export const createPostService = async ({
  file,
  caption,
  keywords,
  platforms,
  scheduled_at,
  userId,
}) => {
  // 1. Upload to Cloudinary
  const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
    folder: "postscheduler",
    tags: keywords ? JSON.parse(keywords) : [],
  });
  if (!cloudinaryResponse) throw new AppError("Cloudinary upload failed", 500);

  // 2. Resolve slot time — custom or auto next available
  const slotTime = scheduled_at
    ? new Date(scheduled_at)
    : await nextAvailableSlot(new Date());

  // 3. Validate platforms
  const selectedPlatforms = parsePlatforms(platforms);
  const invalid = selectedPlatforms.filter((p) => !VALID_PLATFORMS.includes(p));
  if (invalid.length)
    throw new AppError(`Invalid platforms: ${invalid.join(", ")}`, 400);

  // 4. Determine file_type from mimetype
  const mimePrefix = file.mimetype.split("/")[0];
  const fileType = ["image", "video", "audio"].includes(mimePrefix)
    ? mimePrefix
    : "image";

  // 5. Create Post record
  const post = await Post.create({
    user_id: userId,
    cloudinary_url: cloudinaryResponse.secure_url,
    cloudinary_public_id: cloudinaryResponse.public_id,
    file_type: fileType,
    caption,
    keywords: keywords
      ? typeof keywords === "string"
        ? JSON.parse(keywords)
        : keywords
      : [],
    scheduled_at: slotTime,
    status: "scheduled",
  });

  // 6. Book the slot (transaction + lock inside bookSlot)
  await bookSlot(post.id, slotTime);

  // 7. Create PostPlatform rows (one per selected platform)
  await PostPlatform.bulkCreate(
    selectedPlatforms.map((platform) => ({
      post_id: post.id,
      platform,
      publish_status: "pending",
    })),
  );

  // 8. Schedule Agenda job
  const job = await agenda.schedule(slotTime, "publishPost", {
    postId: post.id,
  });
  await post.update({ agenda_job_id: job.attrs._id.toString() });

  // Return full post with platforms
  return post.reload({ include: [PostPlatform] });
};

export const deletePostService = async (postId) => {
  const post = await Post.findByPk(postId, { include: [PostPlatform] });
  if (!post) throw new AppError("Post not found", 404);

  if (post.status === "published") {
    throw new AppError("Cannot delete an already published post", 400);
  }

  // 1. Cancel Agenda job
  const cancelled = await agenda.cancel({
    name: "publishPost",
    "data.postId": postId,
  });
  console.log(`🗑️  Cancelled ${cancelled} agenda job(s) for post ${postId}`);

  // 2. Free the schedule slot
  await freeSlot(postId);

  // 3. Delete Cloudinary asset
  const resourceType = post.file_type === "image" ? "image" : "video";
  await deleteFromCloudinary(post.cloudinary_public_id, resourceType);
  // 4. Destroy post (PostPlatform rows cascade via DB FK)
  await post.destroy();

  return { id: postId, message: "Post deleted" };
};
