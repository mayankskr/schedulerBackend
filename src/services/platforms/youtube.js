import { google } from "googleapis";
import {
  downloadAsBuffer,
  bufferToStream,
  truncate,
  wrapApiError,
} from "../../utils/platformHelpers.js";

/**
 * YouTube Data API v3 — videos.insert()
 *
 * YouTube does NOT accept a URL — it requires the raw file bytes.
 * We download from Cloudinary first, then stream to YouTube.
 *
 * Only supports video. Quota cost: ~1600 units per upload.
 * Daily quota: 10,000 units (free tier).
 */
export const postToYoutube = async ({
  fileUrl,
  caption,
  keywords,
  fileType,
  account,
  // BUG 5 FIX: `privacyStatus` was referenced in requestBody but never defined.
  // Default to "public"; callers can override if needed.
  privacyStatus = "public",
}) => {
  if (fileType !== "video") {
    throw new Error("YouTube only supports video uploads");
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
    );
    // Use per-account refresh token stored in social_accounts table
    auth.setCredentials({ refresh_token: account.refresh_token });
    const youtube = google.youtube({ version: "v3", auth });

    console.log("▶️  Downloading video from Cloudinary for YouTube…");
    const buffer = await downloadAsBuffer(fileUrl);
    const stream = bufferToStream(buffer);

    const { data } = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title:           truncate(caption, 100),   // YT title max 100 chars
          description:     truncate(caption, 5_000),
          tags:            keywords || [],
          categoryId:      "22",                     // People & Blogs
          defaultLanguage: "en",
        },
        status: {
          privacyStatus,                             // BUG 5 FIX: now a real value
          selfDeclaredMadeForKids: false,
          embeddable:              true,
        },
      },
      media: {
        mimeType: "video/mp4",
        body:     stream,
      },
    });

    console.log(`▶️  YouTube upload complete: ${data.id}`);
    return { platform_post_id: data.id };
  } catch (err) {
    throw wrapApiError("YouTube", err);
  }
};