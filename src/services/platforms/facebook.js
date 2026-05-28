import axios from "axios";
import { appendHashtags, truncate, wrapApiError } from "../../utils/platformHelpers.js";

const GRAPH = "https://graph.facebook.com/v18.0";
const VIDEO_GRAPH = "https://graph-video.facebook.com/v18.0";

export const postToFacebook = async ({ fileUrl, caption, keywords, fileType }) => {
  const pageId = process.env.FB_PAGE_ID;
  const token  = process.env.FB_ACCESS_TOKEN;

  const message = truncate(caption, 63_000);

  try {
    if (fileType === "image") {
      // Step 1 — upload photo as unpublished
      const { data: photo } = await axios.post(`${GRAPH}/${pageId}/photos`, {
        url:          fileUrl,
        published:    false,
        access_token: token,
      });

      // Step 2 — publish via feed with attached photo
      const { data } = await axios.post(`${GRAPH}/${pageId}/feed`, {
        message,
        attached_media: [{ media_fbid: photo.id }],
        access_token:   token,
      });
      return { platform_post_id: data.id };
    }

    if (fileType === "video") {
      const { data } = await axios.post(`${VIDEO_GRAPH}/${pageId}/videos`, {
        file_url:     fileUrl,
        description:  message,
        access_token: token,
      });
      return { platform_post_id: data.id };
    }

    if (fileType === "audio") {
      const { data } = await axios.post(`${GRAPH}/${pageId}/feed`, {
        message,
        link:         fileUrl,
        access_token: token,
      });
      return { platform_post_id: data.id };
    }

    throw new Error(`Unsupported file type for Facebook: ${fileType}`);
  } catch (err) {
    throw wrapApiError("Facebook", err);
  }
};