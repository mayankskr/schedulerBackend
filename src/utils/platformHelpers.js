import axios from "axios";
import { Readable } from "stream";

/**
 * Appends keywords as hashtags to caption for Instagram and Twitter.
 * Facebook and YouTube receive keywords as API-level tags instead.
 */
export const appendHashtags = (caption, keywords = []) => {
  if (!keywords.length) return caption;
  const hashtags = keywords
    .map((k) => `#${k.replace(/[^a-zA-Z0-9]/g, "")}`)
    .join(" ");
  return `${caption}\n\n${hashtags}`;
};

/**
 * Truncates a string to maxLength, preserving whole words where possible.
 */
export const truncate = (str, maxLength) => {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3).trimEnd() + "...";
};

/**
 * Downloads a file from a URL and returns it as a Buffer.
 * Used by YouTube and Twitter which require binary upload.
 */
export const downloadAsBuffer = async (url) => {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120_000, // 2 min — large video files
  });
  return Buffer.from(response.data);
};

/**
 * Converts a Buffer to a Readable stream.
 * Used by YouTube's googleapis media upload.
 */
export const bufferToStream = (buffer) => {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
};

/**
 * Resolves the MIME type from a Cloudinary file_type string.
 */
export const resolveMimeType = (fileType, url) => {
  if (fileType === "video") return "video/mp4";
  if (fileType === "audio") return "audio/mpeg";
  // For images, check URL extension
  if (url?.includes(".png")) return "image/png";
  return "image/jpeg";
};

/**
 * Wraps an API error into a consistent Error with platform prefix.
 */
export const wrapApiError = (platform, err) => {
  const detail =
    err?.response?.data?.error?.message || // Meta Graph API
    err?.response?.data?.error?.errors?.[0]?.message || // YouTube
    err?.data?.detail || // Twitter v2
    err?.message ||
    "Unknown error";
  return new Error(`[${platform}] ${detail}`);
};