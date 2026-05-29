import { Worker } from "bullmq";
import { connection } from "../config/queue.js";
// BUG 4a FIX: SocialAccount was used in the include but never imported
import { Post, PostPlatform, SocialAccount } from "../models/index.js";
import { postToFacebook }  from "../services/platforms/facebook.js";
import { postToInstagram } from "../services/platforms/instagram.js";
import { postToYoutube }   from "../services/platforms/youtube.js";
import { postToTwitter }   from "../services/platforms/twitter.js";

const platformAdapters = {
  fb: postToFacebook,
  ig: postToInstagram,
  yt: postToYoutube,
  tw: postToTwitter,
};

export const createPublishWorker = () => {
  const worker = new Worker(
    "publishPost",
    async (job) => {
      const { postId } = job.data;
      console.log(`\n🚀 publishPost fired — postId: ${postId}`);

      const post = await Post.findByPk(postId, {
        include: [
          {
            model:   PostPlatform,
            include: [
              {
                // BUG 4a FIX: SocialAccount now imported so this include works
                model:      SocialAccount,
                attributes: ["id", "label", "platform", "access_token", "refresh_token", "account_id"],
              },
            ],
          },
        ],
      });

      if (!post) {
        console.error(`❌ Post ${postId} not found — aborting job`);
        return;
      }

      if (["published", "failed", "cancelled"].includes(post.status)) {
        console.warn(`⚠️  Post ${postId} already ${post.status} — skipping`);
        return;
      }

      const payload = {
        fileUrl:  post.cloudinary_url,
        caption:  post.caption,
        keywords: post.keywords || [],
        fileType: post.file_type,
      };

      // BUG 4b FIX: original code did `post.PostPlatforms.map(async ...)` but
      // never captured the return value — `results` was referenced later as
      // undefined, causing a ReferenceError at runtime.
      // Fix: wrap in Promise.allSettled so every platform attempt runs in
      // parallel and all outcomes (fulfilled / rejected) are collected.
      const results = await Promise.allSettled(
        post.PostPlatforms.map(async (pp) => {
          const adapter = platformAdapters[pp.platform];
          if (!adapter) throw new Error(`No adapter for platform "${pp.platform}"`);

          const account = pp.SocialAccount;
          if (!account) throw new Error(`No linked SocialAccount on PostPlatform ${pp.id}`);

          try {
            const result = await adapter({ ...payload, account });
            await pp.update({
              publish_status:   "done",
              platform_post_id: result.platform_post_id,
              error_message:    null,
            });
            console.log(`✅ ${account.label} → ${result.platform_post_id}`);
            return result;
          } catch (err) {
            await pp.update({
              publish_status: "failed",
              error_message:  err.message,
            });
            console.error(`❌ ${account.label} → ${err.message}`);
            throw err;   // re-throw so Promise.allSettled marks this as rejected
          }
        }),
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed    = results.filter((r) => r.status === "rejected").length;

      // Partial success: post is published even if some platforms failed.
      // Per-platform rows carry individual statuses.
      const finalStatus = succeeded > 0 ? "published" : "failed";
      await post.update({ status: finalStatus });

      console.log(
        `📌 Post ${postId} — ` +
          `${succeeded}/${results.length} platforms succeeded → status: ${finalStatus}\n`,
      );

      // When EVERY platform failed throw so BullMQ marks the job "failed"
      // and the configured retry / backoff policy kicks in.
      if (succeeded === 0) {
        const reasons = results
          .map((r, i) => `${post.PostPlatforms[i]?.platform}: ${r.reason?.message}`)
          .join("; ");
        throw new Error(`All platforms failed — ${reasons}`);
      }
    },
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on("completed", (job) =>
    console.log(`✅ Job ${job.id} completed`),
  );
  worker.on("failed", (job, err) =>
    console.error(`❌ Job ${job?.id} failed: ${err.message}`),
  );

  console.log("✅ BullMQ publish worker started");
  return worker;
};