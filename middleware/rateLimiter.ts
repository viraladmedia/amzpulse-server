import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from './redisClient';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
  prefix?: string;
}

/**
 * Create an express-rate-limit middleware backed by Redis.
 * Usage:
 *  - global: app.use(createRateLimiter())
 *  - per-route override: app.use('/api/batch', createRateLimiter({ max: 20 }), batchRoutes)
 */
export const createRateLimiter = (opts: RateLimiterOptions = {}) => {
  const windowMs = opts.windowMs ?? Number(process.env.RATE_LIMIT_WINDOW_MS) ?? 60_000;
  const max = opts.max ?? Number(process.env.RATE_LIMIT_MAX) ?? 100;
  const prefix = opts.prefix ?? process.env.RATE_LIMIT_PREFIX ?? 'rl:';

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // rate-limit-redis expects sendCommand-like API
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix
    }),
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
  });
};

export default createRateLimiter;
