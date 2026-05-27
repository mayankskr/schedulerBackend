import rateLimit from "express-rate-limit";

/**
 * Applied to /auth/* routes.
 * Limits brute-force login/register attempts.
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  },
});

/**
 * Applied to POST /posts.
 * Keyed by authenticated user ID (falls back to IP for unauthenticated).
 * 30 requests per hour per user.
 */
export const postRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Post creation rate limit exceeded. Please try again later.",
  },
});