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

      const finalStatus = succeeded === 0 ? "failed" : "published";

      await post.update({ status: finalStatus });

      console.log(
        `📌 Post ${postId} done — ` +
        `${succeeded}/${results.length} platforms succeeded → status: ${finalStatus}\n`
      );
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