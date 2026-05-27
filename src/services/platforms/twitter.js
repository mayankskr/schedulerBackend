import { TwitterApi } from "twitter-api-v2";
import {
  appendHashtags,
  truncate,
  downloadAsBuffer,
  resolveMimeType,
  wrapApiError,
} from "../../utils/platformHelpers.js";

/**
 * Returns a TwitterApi client using OAuth 1.0a credentials.
 * This supports both read and write operations without per-user consent flows.
 */
const getClient = () =>
  new TwitterApi({
    appKey:      process.env.TWITTER_CLIENT_ID,
    appSecret:   process.env.TWITTER_CLIENT_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
  });

/**
 * Twitter/X API v2 — media upload + tweet creation.
 *
 * Flow:
 *   1. Download file from Cloudinary (Twitter requires binary, not URL)
 *   2. Upload via v1.1 media/upload (twitter-api-v2 handles chunked upload)
 *   3. Post tweet via v2 with media_ids attached
 *
 * Limits:
 *   - Images: max 5MB, JPEG/PNG/GIF
 *   - Videos: max 512MB, MP4, 2min 20sec
 *   - Audio: NOT supported — throws immediately
 *   - Tweet text: 280 chars (hashtags count toward limit)
 */
export const postToTwitter = async ({ fileUrl, caption, keywords, fileType }) => {
  if (fileType === "audio") {
    throw new Error("Twitter/X does not support audio uploads");
  }

  try {
    const client   = getClient();
    const mimeType = resolveMimeType(fileType, fileUrl);

    // Twitter caption: 280 chars, hashtags count toward the limit
    const tweetText = truncate(appendHashtags(caption, keywords), 280);

    // ── Step 1: Download from Cloudinary ─────────────────────────
    console.log("🐦 Downloading media from Cloudinary for Twitter...");
    const buffer = await downloadAsBuffer(fileUrl);

    // ── Step 2: Upload media (v1.1) ───────────────────────────────
    // twitter-api-v2 automatically uses chunked upload for video
    const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
    console.log(`🐦 Twitter media uploaded: ${mediaId}`);

    // ── Step 3: Post tweet (v2) ───────────────────────────────────
    const { data } = await client.v2.tweet({
      text:  tweetText,
      media: { media_ids: [mediaId] },
    });

    console.log(`🐦 Tweet posted: ${data.id}`);
    return { platform_post_id: data.id };
  } catch (err) {
    throw wrapApiError("Twitter", err);
  }
};