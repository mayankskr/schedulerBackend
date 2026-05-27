import { Op } from "sequelize";
import { Post, PostPlatform, User } from "../models/index.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { nextAvailableSlot, bookSlot, freeSlot } from "./schedulerService.js";
import agenda from "../config/agenda.js";
import { AppError } from "../utils/appError.js";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const VALID_PLATFORMS = ["fb", "ig", "yt", "tw"];

// Statuses that cannot be edited or deleted
const IMMUTABLE_STATUSES = ["published", "cancelled"];

// ─────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Safely parses platforms — handles JSON string from multipart or plain array.
 * Defaults to all 4 platforms when not provided.
 */
const parsePlatforms = (platforms) => {
  if (Array.isArray(platforms)) return platforms;
  if (typeof platforms === "string") {
    try { return JSON.parse(platforms); } catch { return [platforms]; }
  }
  return [...VALID_PLATFORMS]; // default: all 4
};

/**
 * Safely parses keywords — handles JSON string from multipart or plain array.
 */
const parseKeywords = (keywords) => {
  if (!keywords) return [];
  if (Array.isArray(keywords)) return keywords;
  try { return JSON.parse(keywords); } catch { return [keywords]; }
};

/**
 * Derives the Cloudinary resource_type from a MIME prefix.
 * Audio is treated as "video" by Cloudinary's resource_type taxonomy.
 */
const cloudinaryResourceType = (mimePrefix) =>
  mimePrefix === "image" ? "image" : "video";

/**
 * Determines the file_type enum value from a MIME type string.
 */
const resolveFileType = (mimetype) => {
  const prefix = mimetype.split("/")[0];
  return ["image", "video", "audio"].includes(prefix) ? prefix : "image";
};

/**
 * Resets all PostPlatform rows for a post back to pending state.
 * Used when a failed post is rescheduled for retry.
 */
const resetPlatformStatuses = (postId) =>
  PostPlatform.update(
    { publish_status: "pending", platform_post_id: null, error_message: null },
    { where: { post_id: postId } }
  );

// ─────────────────────────────────────────────────────────────────
// CREATE  —  POST /api/posts
// ─────────────────────────────────────────────────────────────────

export const createPostService = async ({
  file,
  caption,
  keywords,
  platforms,
  scheduled_at,
  userId,
}) => {
  const parsedKeywords    = parseKeywords(keywords);
  const selectedPlatforms = parsePlatforms(platforms);
  const fileType          = resolveFileType(file.mimetype);

  // Validate platforms before touching external services
  const invalidPlatforms = selectedPlatforms.filter((p) => !VALID_PLATFORMS.includes(p));
  if (invalidPlatforms.length)
    throw new AppError(`Invalid platform(s): ${invalidPlatforms.join(", ")}`, 400);

  // ── Step 1: Cloudinary upload (must happen before DB writes so we have the URL) ──
  const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
    folder: "postscheduler",
    tags: parsedKeywords,
    resource_type: "auto",
  });
  if (!cloudinaryResponse)
    throw new AppError("Cloudinary upload failed", 500);

  const { secure_url: cloudinaryUrl, public_id: cloudinaryPublicId } = cloudinaryResponse;

  // Everything below is wrapped so we can clean up Cloudinary on any failure
  try {
    // ── Step 2: Resolve slot time ─────────────────────────────────
    const requestedTime = scheduled_at ? new Date(scheduled_at) : await nextAvailableSlot(new Date());

    // ── Step 3: Persist Post record ───────────────────────────────
    const post = await Post.create({
      user_id:              userId,
      cloudinary_url:       cloudinaryUrl,
      cloudinary_public_id: cloudinaryPublicId,
      file_type:            fileType,
      caption,
      keywords:    parsedKeywords,
      scheduled_at: requestedTime,
      status:       "scheduled",
    });

    // ── Step 4: Book slot (SELECT FOR UPDATE — collision-safe) ────
    // bookSlot returns the actual ScheduleSlot row; slot_time may be bumped
    // by 30 min if another request grabbed requestedTime concurrently.
    const bookedSlot     = await bookSlot(post.id, requestedTime);
    const actualSlotTime = bookedSlot.slot_time;

    // ── Step 5: PostPlatform rows (one per selected platform) ─────
    await PostPlatform.bulkCreate(
      selectedPlatforms.map((platform) => ({
        post_id:        post.id,
        platform,
        publish_status: "pending",
      }))
    );

    // ── Step 6: Schedule Agenda job at the ACTUAL booked time ─────
    const job = await agenda.schedule(actualSlotTime, "publishPost", { postId: post.id });

    // Write back actual slot time + job ID (both may differ from initial values)
    await post.update({
      scheduled_at:  actualSlotTime,
      agenda_job_id: job.attrs._id.toString(),
    });

    return post.reload({ include: [PostPlatform] });

  } catch (err) {
    // Rollback: destroy the Cloudinary asset so we don't leak storage
    await deleteFromCloudinary(cloudinaryPublicId, cloudinaryResourceType(fileType))
      .catch((cleanupErr) =>
        console.error(`⚠️  Cloudinary rollback failed for ${cloudinaryPublicId}:`, cleanupErr.message)
      );
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────
// READ (list)  —  GET /api/posts
// ─────────────────────────────────────────────────────────────────

/**
 * Returns paginated posts scoped to the authenticated user's team.
 * Cancelled (soft-deleted) posts are excluded unless explicitly requested.
 *
 * Query params:
 *   page     {number}  — 1-based, default 1
 *   limit    {number}  — default 10
 *   status   {string}  — filter by Post.status enum value
 *   platform {string}  — filter to posts targeting a specific platform (fb|ig|yt|tw)
 */
export const getPostsService = async (
  userId,
  { page = 1, limit = 10, status, platform } = {}
) => {
  // ── Resolve team scope ────────────────────────────────────────
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

  // ── Build WHERE clause ────────────────────────────────────────
  const where = { user_id: { [Op.in]: teamUserIds } };

  if (status) {
    // Allow explicit status filter (e.g. ?status=cancelled to see soft-deleted)
    where.status = status;
  } else {
    // Default: hide soft-deleted posts
    where.status = { [Op.ne]: "cancelled" };
  }

  // ── Platform filter (applied to the join table) ───────────────
  const platformInclude = {
    model:    PostPlatform,
    required: !!platform, // INNER JOIN only when filtering by platform
  };
  if (platform) platformInclude.where = { platform };

  // ── Query ─────────────────────────────────────────────────────
  const parsedPage  = Math.max(1, parseInt(page)  || 1);
  const parsedLimit = Math.min(100, parseInt(limit) || 10); // cap at 100

  const { count, rows } = await Post.findAndCountAll({
    where,
    include: [
      platformInclude,
      { model: User, attributes: ["id", "name", "email"] },
    ],
    order:    [["scheduled_at", "DESC"]],
    limit:    parsedLimit,
    offset:   (parsedPage - 1) * parsedLimit,
    distinct: true, // prevents inflated counts from the JOIN
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
      { model: PostPlatform },
      { model: User, attributes: ["id", "name", "email"] },
    ],
  });
  if (!post) throw new AppError("Post not found", 404);
  return post;
};

// ─────────────────────────────────────────────────────────────────
// UPDATE  —  PATCH /api/posts/:id
// ─────────────────────────────────────────────────────────────────

/**
 * Partial update — only touches fields explicitly provided.
 *
 * Supports: new file, caption, keywords, platform selection, reschedule.
 *
 * Failed-post retry:
 *   A "failed" post has already had its Agenda job run. Sending any change
 *   auto-triggers a reschedule: the Agenda job is re-queued, a new slot is
 *   booked, and all platform rows are reset to "pending". Provide scheduled_at
 *   for a specific retry time, or omit it to use the next available slot.
 */
export const updatePostService = async ({
  postId,
  file,
  caption,
  keywords,
  platforms,
  scheduled_at,
  userId,
}) => {
  const post = await Post.findByPk(postId, { include: [PostPlatform] });
  if (!post) throw new AppError("Post not found", 404);

  if (IMMUTABLE_STATUSES.includes(post.status)) {
    throw new AppError(
      `Cannot edit a ${post.status} post. Only scheduled, draft, or failed posts can be modified.`,
      400
    );
  }

  const updates    = {};
  const isFailed   = post.status === "failed";

  // A failed post must be re-queued on every edit so the changes take effect.
  // If no new time is provided we auto-slot it.
  const willReschedule = scheduled_at !== undefined || isFailed;

  // ── File replacement ──────────────────────────────────────────
  if (file) {
    // Destroy old Cloudinary asset before uploading the replacement
    if (post.cloudinary_public_id) {
      await deleteFromCloudinary(
        post.cloudinary_public_id,
        cloudinaryResourceType(post.file_type)
      );
    }

    const cloudinaryResponse = await uploadOnCloudinary(file.buffer, {
      folder: "postscheduler",
      tags:   keywords ? parseKeywords(keywords) : post.keywords,
    });
    if (!cloudinaryResponse)
      throw new AppError("Cloudinary upload failed during file replacement", 500);

    updates.cloudinary_url       = cloudinaryResponse.secure_url;
    updates.cloudinary_public_id = cloudinaryResponse.public_id;
    updates.file_type            = resolveFileType(file.mimetype);
  }

  // ── Caption ───────────────────────────────────────────────────
  if (caption !== undefined) updates.caption = caption;

  // ── Keywords ──────────────────────────────────────────────────
  if (keywords !== undefined) updates.keywords = parseKeywords(keywords);

  // ── Platform selection ────────────────────────────────────────
  // Replace the platform rows regardless; if rescheduling they'll be reset
  // to pending by resetPlatformStatuses() below anyway.
  if (platforms !== undefined) {
    const selectedPlatforms = parsePlatforms(platforms);
    const invalidPlatforms  = selectedPlatforms.filter((p) => !VALID_PLATFORMS.includes(p));
    if (invalidPlatforms.length)
      throw new AppError(`Invalid platform(s): ${invalidPlatforms.join(", ")}`, 400);

    await PostPlatform.destroy({ where: { post_id: postId } });
    await PostPlatform.bulkCreate(
      selectedPlatforms.map((platform) => ({
        post_id:        postId,
        platform,
        publish_status: "pending",
      }))
    );
  }

  // ── Reschedule / retry ────────────────────────────────────────
  if (willReschedule) {
    // Cancel the old job (returns 0 for already-run jobs — that is safe)
    await agenda.cancel({ name: "publishPost", "data.postId": postId });

    // Free the old slot so it becomes available again
    await freeSlot(postId);

    // Determine target time: explicit override > auto next available
    const targetTime = scheduled_at
      ? new Date(scheduled_at)
      : await nextAvailableSlot(new Date());

    // Book the new slot (collision-safe, may return a bumped time)
    const bookedSlot     = await bookSlot(postId, targetTime);
    const actualSlotTime = bookedSlot.slot_time;

    // Re-queue the Agenda job at the actual booked time
    const job = await agenda.schedule(actualSlotTime, "publishPost", { postId });

    updates.scheduled_at  = actualSlotTime;
    updates.agenda_job_id = job.attrs._id.toString();
    updates.status        = "scheduled";

    // If platforms were NOT explicitly changed above, still reset their
    // publish statuses to pending so the retry attempt is clean
    if (platforms === undefined) {
      await resetPlatformStatuses(postId);
    }
  }

  await post.update(updates);
  return post.reload({ include: [PostPlatform] });
};

// ─────────────────────────────────────────────────────────────────
// DELETE  —  DELETE /api/posts/:id
// ─────────────────────────────────────────────────────────────────

/**
 * Soft-delete a post.
 *
 * Steps:
 *   1. Cancel the Agenda job
 *   2. Free the ScheduleSlot
 *   3. Destroy the Cloudinary asset (irreversible)
 *   4. Soft-delete the Post row (status → "cancelled", nullify cloudinary refs)
 *
 * The row is retained so team admins can review cancellation history.
 * PostPlatform rows are NOT deleted — they preserve the intended platform list.
 */
export const deletePostService = async (postId, userId) => {
  const post = await Post.findByPk(postId, { include: [PostPlatform] });
  if (!post) throw new AppError("Post not found", 404);

  if (post.status === "published") {
    throw new AppError("Cannot delete an already published post", 400);
  }
  if (post.status === "cancelled") {
    throw new AppError("Post is already cancelled", 400);
  }

  // ── Step 1: Cancel Agenda job ─────────────────────────────────
  const cancelledJobs = await agenda.cancel({
    name:           "publishPost",
    "data.postId":  postId,
  });
  console.log(`🗑️  Cancelled ${cancelledJobs} Agenda job(s) for post ${postId}`);

  // ── Step 2: Free the schedule slot ───────────────────────────
  await freeSlot(postId);

  // ── Step 3: Destroy Cloudinary asset ─────────────────────────
  if (post.cloudinary_public_id) {
    await deleteFromCloudinary(
      post.cloudinary_public_id,
      cloudinaryResourceType(post.file_type)
    );
  }

  // ── Step 4: Soft-delete — preserve row for audit ──────────────
  await post.update({
    status:               "cancelled",
    cloudinary_url:       null,  // asset is gone — don't keep a broken URL
    cloudinary_public_id: null,  // prevent future deletion attempts on non-existent asset
  });

  return { id: postId, message: "Post cancelled successfully" };
};