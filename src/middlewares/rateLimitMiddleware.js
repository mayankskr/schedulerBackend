import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

export const postRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req),  // ← fixed
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: "Post creation rate limit exceeded. Please try again later.",
  },
});