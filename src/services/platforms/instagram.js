import axios from "axios";
import {
  appendHashtags,
  truncate,
  wrapApiError,
} from "../../utils/platformHelpers.js";

const GRAPH = "https://graph.facebook.com/v18.0";

const MAX_POLL_ATTEMPTS = 12;  // 12 × 5s = 60s max wait
const POLL_INTERVAL_MS  = 5_000;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Polls the media container until it reaches FINISHED status.
 * IG video processing can take 10–60 seconds.
 */
const waitForContainer = async (creationId, token) => {
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const { data } = await axios.get(`${GRAPH}/${creationId}`, {
      params: { fields: "status_code,status", access_token: token },
    });

    console.log(
      `📸 IG container [${attempt}/${MAX_POLL_ATTEMPTS}]: ${data.status_code}`
    );

    if (data.status_code === "FINISHED") return;

    if (["ERROR", "EXPIRED"].includes(data.status_code)) {
      throw new Error(
        `IG container ${data.status_code}: ${data.status || "unknown reason"}`
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("IG container timed out — processing took too long");
};

/**
 * Instagram Graph API — 3-step publish flow:
 *   1. Create media container (image_url or video_url + media_type)
 *   2. Poll until status_code === FINISHED
 *   3. Publish the container → returns the live post ID
 *
 * Requirements:
 *   - IG Business or Creator account
 *   - Linked to a Facebook Page
 *   - FB_ACCESS_TOKEN must have instagram_basic + instagram_content_publish scopes
 */
export const postToInstagram = async ({ fileUrl, caption, keywords, fileType }) => {
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token   = process.env.FB_ACCESS_TOKEN; // IG uses the FB Page token

  if (fileType === "audio") {
    throw new Error("Instagram does not support audio posts");
  }

  // Instagram caption: max 2200 chars, hashtags go inside the caption
  const formattedCaption = truncate(appendHashtags(caption, keywords), 2_200);

  try {
    // ── Step 1: Create container ──────────────────────────────────
    const containerBody = {
      caption: formattedCaption,
      access_token: token,
    };

    if (fileType === "image") {
      containerBody.image_url = fileUrl;
    } else if (fileType === "video") {
      containerBody.video_url  = fileUrl;
      containerBody.media_type = "REELS"; // feed video must be Reels via Graph API
    }

    const { data: container } = await axios.post(
      `${GRAPH}/${igUserId}/media`,
      containerBody
    );
    const creationId = container.id;
    console.log(`📸 IG container created: ${creationId}`);

    // ── Step 2: Wait for FINISHED ─────────────────────────────────
    await waitForContainer(creationId, token);

    // ── Step 3: Publish ───────────────────────────────────────────
    const { data: published } = await axios.post(
      `${GRAPH}/${igUserId}/media_publish`,
      { creation_id: creationId, access_token: token }
    );

    return { platform_post_id: published.id };
  } catch (err) {
    throw wrapApiError("Instagram", err);
  }
};