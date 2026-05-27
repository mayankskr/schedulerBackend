import axios from "axios";
import { appendHashtags, truncate, wrapApiError } from "../../utils/platformHelpers.js";

const GRAPH = "https://graph.facebook.com/v18.0";
const VIDEO_GRAPH = "https://graph-video.facebook.com/v18.0";

/**
 * Facebook Graph API supports image, video, and audio (via feed link).
 *
 * Image → POST /{page-id}/photos
 * Video → POST /{page-id}/videos  (uses video graph endpoint)
 * Audio → POST /{page-id}/feed    (shared as external link — FB has no native audio post)
 */
export const postToFacebook = async ({ fileUrl, caption, keywords, fileType }) => {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_ACCESS_TOKEN;

  // Facebook uses keywords as API-level tags, not hashtags in caption
  const message = truncate(caption, 63_000);
  const tags = keywords?.length ? keywords.join(",") : undefined;

  try {
    if (fileType === "image") {
      const { data } = await axios.post(`${GRAPH}/${pageId}/photos`, {
        url: fileUrl,
        message,
        access_token: token,
      });
      return { platform_post_id: data.id };
    }

    if (fileType === "video") {
      const { data } = await axios.post(`${VIDEO_GRAPH}/${pageId}/videos`, {
        file_url: fileUrl,
        description: message,
        ...(tags && { content_tags: tags }),
        access_token: token,
      });
      return { platform_post_id: data.id };
    }

    if (fileType === "audio") {
      // Facebook has no native audio post type.
      // Best available: share as a feed link so followers can click through.
      const { data } = await axios.post(`${GRAPH}/${pageId}/feed`, {
        message,
        link: fileUrl,
        access_token: token,
      });
      return { platform_post_id: data.id };
    }

    throw new Error(`Unsupported file type for Facebook: ${fileType}`);
  } catch (err) {
    throw wrapApiError("Facebook", err);
  }
};