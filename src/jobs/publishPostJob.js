import agenda from "../config/agenda.js";
import { Post, PostPlatform } from "../models/index.js";
import { postToFacebook  } from "../services/platforms/facebook.js";
import { postToInstagram } from "../services/platforms/instagram.js";
import { postToYoutube   } from "../services/platforms/youtube.js";
import { postToTwitter   } from "../services/platforms/twitter.js";

/**
 * Maps platform enum values to their adapter functions.
 * Adding a new platform = add one entry here.
 */
const platformAdapters = {
  fb: postToFacebook,
  ig: postToInstagram,
  yt: postToYoutube,
  tw: postToTwitter,
};

agenda.define(
  "publishPost",
  { priority: "high", concurrency: 10 },
  async (job) => {
    const { postId } = job.attrs.data;
    console.log(`\n🚀 publishPost fired — postId: ${postId}`);

    // Load post with all platform rows
    const post = await Post.findByPk(postId, {
      include: [PostPlatform],
    });

    if (!post) {
      console.error(`❌ Post ${postId} not found — aborting job`);
      return;
    }

    // Skip if already handled (e.g. job fired twice due to restart)
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

    // ── Publish to every platform independently ───────────────────
    // Promise.allSettled guarantees all platforms are attempted
    // even if one throws — no cascade failures.
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

          console.log(
            `  ✅ ${pp.platform.toUpperCase()} → ${result.platform_post_id}`
          );
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

    // ── Determine overall post status ─────────────────────────────
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed    = results.filter((r) => r.status === "rejected").length;

    let finalStatus;
    if (succeeded === 0)             finalStatus = "failed";
    else if (failed === 0)           finalStatus = "published";
    else                             finalStatus = "published"; // partial — still mark published

    await post.update({ status: finalStatus });

    console.log(
      `📌 Post ${postId} done — ` +
      `${succeeded}/${results.length} platforms succeeded → status: ${finalStatus}\n`
    );
  }
);