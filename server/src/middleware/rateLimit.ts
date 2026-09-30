import { type Request } from "express";
import rateLimit from "express-rate-limit";

/**
 * Request limits that keep one person or script from flooding the app.
 * Limits are per IP address. If the API is deployed behind a proxy, set
 * `app.set("trust proxy", 1)` so the real client address is used.
 */

const tooMany = (message: string) => ({ message });

/** Sign-in and sign-up: slows password guessing and account spam. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many sign-in attempts. Please wait a few minutes and try again."),
});

/**
 * Admin sign-in: tighter, since one guessed password opens everything. Only
 * failed attempts count, so an admin signing in normally is never locked out.
 */
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany("Too many sign-in attempts. Please wait 15 minutes and try again."),
});

/**
 * Writes to the social and messaging features (requests, posts, comments,
 * likes, reposts, messages). Reads are never limited.
 */
export const socialWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req: Request) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  message: tooMany("You're doing that too quickly. Please wait a moment and try again."),
});
