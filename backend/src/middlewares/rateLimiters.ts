import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';

export interface AuthRateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createAuthRateLimiter(options: AuthRateLimiterOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests, please try again later',
        },
      });
    },
  });
}
