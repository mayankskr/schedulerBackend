import { Op } from "sequelize";
import { Job } from "bullmq";
// BUG 2a FIX: SocialAccount was used below but never imported
import { Post, PostPlatform, User, SocialAccount } from "../models/index.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { nextAvailableSlot, bookSlot, freeSlot } from "./schedulerService.js";
import postQueue from "../config/queue.js";
import { AppError } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const IMMUTABLE_STATUSES = ["published", "cancelled"];

// ─────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Parses account IDs from FormData (JSON string) or a plain array.
 */
const parseAccountIds = (accounts) => {
  if (Array.isArray(accounts)) return accounts;
  if (typeof accounts === "string") {
    try { return JSON.parse(accounts); } catch { return [accounts]; }
  }
  return [];
};

const parseKeywords = (keywords) => {
  if (!keywords) return [];
  if (Array.isArray(keywords)) return keywords;
  try { return JSON.parse(keywords); } catch { return [keywords]; }
};

const cloudinaryResourceType = (fileType) =>
  fileType === "image" ? "image" : "video";

const resolveFileType = (mimetype) => {
  const prefix = mimetype.split("/")[0];
  return ["image", "video", "audio"].includes(prefix) ? prefix : "image";
};

const resetPlatformStatuses = (postId) =>
  PostPlatform.update(
    { publish_status: "pending", platform_post_id: null, error_message: null },
    { where: { post_id: postId } },
  );

/**
 * Cancels a BullMQ job by postId (used as jobId).
 * Safe to call even if the job has already run or doesn't exist.
 */
const cancelJob = async (postId) => {
  try {
    const job = await Job.fromId(postQueue, postId);
    if (job) await job.remove();
  } catch {
    // Job already ran or doesn't exist — safe to ignore
  }
};

/**
 * Schedules a BullMQ delayed job.
 * Uses postId as jobId so it can always be found and cancelled later.
 */
const scheduleJob = async (postId, slotTime) => {
  const delay = Math.max(0, new Date(slotTime) - Date.now());
  const job = await postQueue.add(
    "publishPost",
    { postId },
    { jobId: postId, delay },
  );
  return job.id;
};

// ─────────────────────────────────────────────────────────────────
// CREATE  —  POST /api/posts
// ─────────────────────────────────────────────────────────────────

export const createPostService = async ({
  file,
  caption,
  keywords,
  accounts,       // array of SocialAccount UUIDs (from FormData JSON string)
  scheduled_at,
  userId,
}) => {
  const accountIds = parseAccountIds(accounts);
  if (!accountIds.length)
    throw new AppError("Select at least one account", 400);

  // BUG 2b FIX: parsedKeywords and fileType were used below but never defined
  const parsedKeywords = parseKeywords(keywords);
  const fileType       = resolveFileType(file.mimetype);

  const user = await User.findByPk(userId);
  if (!user) throw new AppError("User not found", 404);

  // Validate all selected accounts belong to this team and are active
  const selectedAccounts = await SocialAccount.findAll({
    where: { id: accountIds, team_id: user.team_id, is_active: true },
  });
  if (selectedAccounts.length !== accountIds.length)
    throw new AppError("One or more account IDs are invalid or inactive", 400);

  // ── Step 1: Cloudinary upload ─────────────────────────────────
  const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
    folder:        "postscheduler",
    tags:          parsedKeywords,   // BUG 2b FIX: was referencing undefined variable
    resource_type: "auto",
  });
  if (!cloudinaryResponse) throw new AppError("Cloudinary upload failed", 500);

  const { secure_url: cloudinaryUrl, public_id: cloudinaryPublicId } =
    cloudinaryResponse;

  let post;

  try {
    // ── Step 2: Resolve slot time ─────────────────────────────────
    const requestedTime = scheduled_at
      ? new Date(scheduled_at)
      : await nextAvailableSlot(new Date());

    // ── Step 3: Persist Post record ───────────────────────────────
    post = await Post.create({
      user_id:              userId,
      cloudinary_url:       cloudinaryUrl,
      cloudinary_public_id: cloudinaryPublicId,
      file_type:            fileType,      // BUG 2c FIX: was referencing undefined variable
      caption,
      keywords:             parsedKeywords,
      scheduled_at:         requestedTime,
      status:               "scheduled",
    });

    // ── Step 4: Book slot (collision-safe) ────────────────────────
    const bookedSlot     = await bookSlot(post.id, requestedTime);
    const actualSlotTime = bookedSlot.slot_time;

    // ── Step 5: PostPlatform rows (one per selected account) ──────
    await PostPlatform.bulkCreate(
      selectedAccounts.map((acct) => ({
        post_id:          post.id,
        social_account_id: acct.id,
        platform:         acct.platform,   // denormalised for easy filtering
        publish_status:   "pending",
      })),
    );

    // ── Step 6: Schedule BullMQ job ───────────────────────────────
    const jobId = await scheduleJob(post.id, actualSlotTime);

    await post.update({
      scheduled_at:  actualSlotTime,
      agenda_job_id: jobId,
    });

    return post.reload({ include: [PostPlatform] });

  } catch (err) {
    // Rollback: delete Cloudinary asset then orphaned Post row
    await deleteFromCloudinary(
      cloudinaryPublicId,
      cloudinaryResourceType(fileType),
    ).catch((e) =>
      console.error(`⚠️  Cloudinary rollback failed for ${cloudinaryPublicId}:`, e.message),
    );

    if (post?.id) {
      await post.destroy().catch((e) =>
        console.error(`⚠️  Post record rollback failed for ${post.id}:`, e.message),
      );
    }

    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────
// READ (list)  —  GET /api/posts
// ─────────────────────────────────────────────────────────────────

export const getPostsService = async (
  userId,
  { page = 1, limit = 10, status, platform } = {},
) => {
  const currentUser = await User.findByPk(userId);
  if (!currentUser) throw new AppError("User not found", 404);

  let teamUserIds = [userId];
  if (currentUser.team_id) {
    const teamMembers = await User.findAll({
      where:      { team_id: currentUser.team_id },
      attributes: ["id"],
    });
    teamUserIds = teamMembers.map((u) => u.id);
  }

  const where = { user_id: { [Op.in]: teamUserIds } };

  if (status) {
    where.status = status;
  } else {
    where.status = { [Op.ne]: "cancelled" };
  }

  const platformInclude = {
    model:    PostPlatform,
    required: !!platform,
  };
  if (platform) platformInclude.where = { platform };

  const parsedPage  = Math.max(1, parseInt(page)  || 1);
  const parsedLimit = Math.min(100, parseInt(limit) || 10);

  const { count, rows } = await Post.findAndCountAll({
    where,
    include: [
      platformInclude,
      { model: User, attributes: ["id", "name", "email"] },
    ],
    order:    [["scheduled_at", "DESC"]],
    limit:    parsedLimit,
    offset:   (parsedPage - 1) * parsedLimit,
    distinct: true,
  });

  return {
    posts:      rows,
    total:      count,
    page:       parsedPage,
    limit:      parsedLimit,
    totalPages: Math.ceil(count / parsedLimit),
    hasNext:    parsedPage < Math.ceil(count / parsedLimit),
    hasPrev:    parsedPage > 1,
  };
};

// ─────────────────────────────────────────────────────────────────
// READ (single)  —  GET /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const getPostService = async (postId) => {
  const post = await Post.findByPk(postId, {
    include: [
      {
        model:   PostPlatform,
        include: [{ model: SocialAccount, attributes: ["id", "label", "platform", "account_id"] }],
      },
      { model: User, attributes: ["id", "name", "email"] },
    ],
  });
  if (!post) throw new AppError("Post not found", 404);
  return post;
};

// ─────────────────────────────────────────────────────────────────
// UPDATE  —  PATCH /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const updatePostService = async ({
  postId,
  file,
  caption,
  keywords,
  accounts,       // BUG 3a FIX: was `platforms`
  scheduled_at,
  userId,
}) => {
  const post = await Post.findByPk(postId, { include: [PostPlatform] });
  if (!post) throw new AppError("Post not found", 404);

  if (IMMUTABLE_STATUSES.includes(post.status)) {
    throw new AppError(
      `Cannot edit a ${post.status} post. Only scheduled, draft, or failed posts can be modified.`,
      400,
    );
  }

  const updates  = {};
  const isFailed = post.status === "failed";
  const willReschedule = scheduled_at !== undefined || isFailed;

  // ── File replacement ──────────────────────────────────────────
  if (file) {
    const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
      folder:        "postscheduler",
      tags:          keywords ? parseKeywords(keywords) : post.keywords,
      resource_type: "auto",
    });
    if (!cloudinaryResponse)
      throw new AppError("Cloudinary upload failed during file replacement", 500);

    // New upload confirmed — safe to remove old asset
    if (post.cloudinary_public_id) {
      await deleteFromCloudinary(
        post.cloudinary_public_id,
        cloudinaryResourceType(post.file_type),
      ).catch((e) =>
        console.error(`⚠️  Failed to delete old Cloudinary asset:`, e.message),
      );
    }

    updates.cloudinary_url       = cloudinaryResponse.secure_url;
    updates.cloudinary_public_id = cloudinaryResponse.public_id;
    updates.file_type            = resolveFileType(file.mimetype);
  }

  if (caption  !== undefined) updates.caption  = caption;
  if (keywords !== undefined) updates.keywords = parseKeywords(keywords);

  // ── Account selection ─────────────────────────────────────────
  if (accounts !== undefined) {
    // BUG 3b FIX: `parsePlatforms` does not exist — use parseAccountIds
    const accountIds = parseAccountIds(accounts);

    if (accountIds.length === 0)
      throw new AppError("Select at least one account", 400);

    // BUG 3c FIX: validate accounts against DB and include social_account_id
    const user = await User.findByPk(userId);
    const selectedAccounts = await SocialAccount.findAll({
      where: { id: accountIds, team_id: user.team_id, is_active: true },
    });
    if (selectedAccounts.length !== accountIds.length)
      throw new AppError("One or more account IDs are invalid or inactive", 400);

    await PostPlatform.destroy({ where: { post_id: postId } });
    await PostPlatform.bulkCreate(
      selectedAccounts.map((acct) => ({
        post_id:           postId,
        social_account_id: acct.id,
        platform:          acct.platform,
        publish_status:    "pending",
      })),
    );
  }

  // ── Reschedule / retry ────────────────────────────────────────
  if (willReschedule) {
    await cancelJob(postId);
    await freeSlot(postId);

    const targetTime = scheduled_at
      ? new Date(scheduled_at)
      : await nextAvailableSlot(new Date());
    const bookedSlot     = await bookSlot(postId, targetTime);
    const actualSlotTime = bookedSlot.slot_time;
    const jobId          = await scheduleJob(postId, actualSlotTime);

    updates.scheduled_at  = actualSlotTime;
    updates.agenda_job_id = jobId;
    updates.status        = "scheduled";

    if (accounts === undefined) {
      await resetPlatformStatuses(postId);
    }
  }

  await post.update(updates);
  return post.reload({ include: [PostPlatform] });
};

// ─────────────────────────────────────────────────────────────────
// DELETE  —  DELETE /api/posts/:id
// ─────────────────────────────────────────────────────────────────

export const deletePostService = async (postId, userId) => {
  const post = await Post.findByPk(postId, { include: [PostPlatform] });
  if (!post) throw new AppError("Post not found", 404);

  if (post.status === "published") {
    throw new AppError("Cannot delete an already published post", 400);
  }
  if (post.status === "cancelled") {
    throw new AppError("Post is already cancelled", 400);
  }

  await cancelJob(postId);
  await freeSlot(postId);

  if (post.cloudinary_public_id) {
    await deleteFromCloudinary(
      post.cloudinary_public_id,
      cloudinaryResourceType(post.file_type),
    );
  }

  await post.update({
    status:               "cancelled",
    cloudinary_url:       null,
    cloudinary_public_id: null,
  });

  return { id: postId, message: "Post cancelled successfully" };
};