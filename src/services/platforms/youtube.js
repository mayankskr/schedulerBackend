import { google } from "googleapis";
import {
  downloadAsBuffer,
  bufferToStream,
  truncate,
  wrapApiError,
} from "../../utils/platformHelpers.js";

/**
 * Builds an OAuth2 client pre-loaded with the stored refresh token.
 * googleapis handles token rotation automatically.
 */
const getAuth = () => {
  const client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI || "https://developers.google.com/oauthplayground"
  );
  client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });
  return client;
};

/**
 * YouTube Data API v3 — videos.insert()
 *
 * YouTube does NOT accept a URL — it requires the raw file bytes.
 * We download from Cloudinary first, then stream to YouTube.
 *
 * Only supports video. Quota cost: ~1600 units per upload.
 * Daily quota: 10,000 units (free tier).
 *
 * Privacy defaults to "public". Pass privacyStatus in options to override.
 */
export const postToYoutube = async ({
  fileUrl,
  caption,
  keywords,
  fileType,
  privacyStatus = "public",
}) => {
  if (fileType !== "video") {
    throw new Error("YouTube only supports video uploads");
  }

  try {
    const auth    = getAuth();
    const youtube = google.youtube({ version: "v3", auth });

    // Download from Cloudinary (may take time for large files)
    console.log("▶️  Downloading video from Cloudinary for YouTube...");
    const buffer = await downloadAsBuffer(fileUrl);
    const stream = bufferToStream(buffer);

    const { data } = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title:       truncate(caption, 100),  // YT title max 100 chars
          description: truncate(caption, 5_000),
          tags:        keywords || [],
          categoryId:  "22",  // People & Blogs — change as needed
          defaultLanguage: "en",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
          embeddable: true,
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