import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

/**
 * @swagger
 * components:
 *   schemas:
 *     RateLimitInfo:
 *       type: object
 *       description: >
 *         IP-based rate limiting is applied to all API endpoints. Pass an
 *         X-API-Key header to access higher throughput tiers.
 *       properties:
 *         tiers:
 *           type: object
 *           properties:
 *             public:
 *               type: string
 *               example: "100 requests/minute (no key required)"
 *             developer:
 *               type: string
 *               example: "300 requests/minute (API_KEYS_DEVELOPER)"
 *             premium:
 *               type: string
 *               example: "1000 requests/minute (API_KEYS_PREMIUM)"
 */

/**
 * API-key tiers (set via X-API-Key header).
 * Keys are loaded from env: API_KEYS_DEVELOPER, API_KEYS_PREMIUM (comma-separated).
 */
const developerKeys = new Set(
  (process.env.API_KEYS_DEVELOPER ?? '').split(',').filter(Boolean)
);
const premiumKeys = new Set(
  (process.env.API_KEYS_PREMIUM ?? '').split(',').filter(Boolean)
);

// Tier limits (requests per minute)
const TIERS = {
  premium: { windowMs: 60_000, max: 1000 },
  developer: { windowMs: 60_000, max: 300 },
  public: { windowMs: 60_000, max: 100 },
};

function getTier(apiKey: string | undefined): keyof typeof TIERS {
  if (apiKey && premiumKeys.has(apiKey)) return 'premium';
  if (apiKey && developerKeys.has(apiKey)) return 'developer';
  return 'public';
}

// One limiter instance per tier, keyed by IP + tier
const limiters = {
  premium: rateLimit({ ...TIERS.premium, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `premium:${req.ip}` }),
  developer: rateLimit({ ...TIERS.developer, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `developer:${req.ip}` }),
  public: rateLimit({ ...TIERS.public, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `public:${req.ip}` }),
};

/**
 * Middleware: reads X-API-Key, selects the appropriate rate limiter tier,
 * and delegates to it.
 */
export function tieredRateLimit(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const tier = getTier(apiKey);
  return limiters[tier](req, res, next);
}
