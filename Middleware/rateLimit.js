/**
 * Minimal fixed-window rate limiter.
 *
 * Protects promo redemption from two attacks:
 *   - brute forcing valid codes (8 chars from a 31-symbol alphabet is not
 *     guessable, but an unthrottled endpoint still leaks timing and lets an
 *     attacker burn through attempts at wire speed)
 *   - one account hammering redemption to probe or to race a code
 *
 * Keys on authenticated user id when available, otherwise client IP.
 *
 * NOTE: state is per-process. That is correct for the current single-instance
 * PM2 deployment. If the API is ever scaled to multiple instances or moved
 * behind a load balancer, move this to a shared store (Redis) or the limit
 * becomes per-instance and effectively 1xN.
 */
const buckets = new Map();

// Drop expired buckets so the map cannot grow without bound.
const sweep = () => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};
const sweepTimer = setInterval(sweep, 60 * 1000);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

const clientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(ip || req.ip || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
};

export const rateLimit = ({ windowMs = 60 * 1000, max = 10, keyPrefix = 'rl', message } = {}) =>
  (req, res, next) => {
    const identity = req.user?.id ? `u:${req.user.id}` : `ip:${clientIp(req)}`;
    const key = `${keyPrefix}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: message || 'Too many attempts. Please wait a moment and try again.'
      });
    }

    return next();
  };

export const __resetRateLimits = () => buckets.clear();