import { Worker } from "bullmq";
import { connection } from "../config/queue.js";
import { Post, PostPlatform } from "../models/index.js";
import { postToFacebook  } from "../services/platforms/facebook.js";
import { postToInstagram } from "../services/platforms/instagram.js";
import { postToYoutube   } from "../services/platforms/youtube.js";
import { postToTwitter   } from "../services/platforms/twitter.js";

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
        include: [PostPlatform],
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

      const results = await Promise.allSettled(
        post.PostPlatforms.map(async (pp) => {
          const adapter = platformAdapters[pp.platform];

          if (!adapter) {
            const msg = `No adapter registered for platform: ${pp.platform}`;
            await pp.update({ publish_status: "failed", error_message: msg });
            throw new Error(msg);
          }

          try {
            const result = await adapter(payload);
            await pp.update({
              publish_status:   "done",
              platform_post_id: result.platform_post_id,
              error_message:    null,
            });
            console.log(`  ✅ ${pp.platform.toUpperCase()} → ${result.platform_post_id}`);
          } catch (err) {
            await pp.update({
              publish_status: "failed",
              error_message:  err.message,
            });
            console.error(`  ❌ ${pp.platform.toUpperCase()} → ${err.message}`);
            throw err;
          }
        })
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed    = results.filter((r) => r.status === "rejected").length;

      // Partial success — post is considered published even if some platforms failed.
      // Per-platform rows already carry individual statuses.
      const finalStatus = succeeded > 0 ? "published" : "failed";
      await post.update({ status: finalStatus });

      console.log(
        `📌 Post ${postId} done — ` +
        `${succeeded}/${results.length} platforms succeeded → status: ${finalStatus}\n`
      );

      // FIX (Bug 2): When EVERY platform call failed, the worker was previously
      // returning normally, causing BullMQ to mark the job as "completed".
      // That made the queue's `attempts: 3` / exponential backoff config
      // completely inert — retries never fired.
      //
      // Now we throw so BullMQ marks the job "failed" and schedules a retry
      // (up to the configured attempts limit with exponential backoff).
      // Partial success (≥1 platform OK) still resolves cleanly — the job
      // won't be retried and the post stays "published".
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
    }
  );

  worker.on("completed", (job) =>
    console.log(`✅ Job ${job.id} completed`)
  );
  worker.on("failed", (job, err) =>
    console.error(`❌ Job ${job?.id} failed: ${err.message}`)
  );

  console.log("✅ BullMQ publish worker started");
  return worker;
};