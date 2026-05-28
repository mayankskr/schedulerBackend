import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// express-rate-limit v7 exports `ipKeyGenerator` as a named helper that
// correctly normalises IPv6 addresses (e.g. "::ffff:127.0.0.1" → "127.0.0.1").
// Using `req.ip` directly in a custom keyGenerator bypasses that normalisation
// and triggers ERR_ERL_KEY_GEN_IPV6 at startup.  The fix is to import and use
// the official helper for any IP-based fallback.

export const authRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success:    false,
    statusCode: 429,
    message:    "Too many authentication attempts. Please try again in 15 minutes.",
  },
});

export const postRateLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 hour
  max:             30,
  // Key by authenticated user ID when available (post-auth routes always have
  // req.user set by verifyJWT).  Fall back to the normalised IP address using
  // the official ipKeyGenerator helper — required by express-rate-limit v7 to
  // prevent IPv6 users from bypassing limits via address variants.
  keyGenerator:    (req) => req.user?.id ?? ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success:    false,
    statusCode: 429,
    message:    "Post creation rate limit exceeded. Please try again later.",
  },
});