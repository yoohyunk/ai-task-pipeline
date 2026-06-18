// demo-app API rate limiting
const MAX_REQUESTS_PER_MINUTE = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE, 10) || 60;
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';

const clientRequestMap = new Map();

function getClientKey(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

function cleanupExpiredWindows() {
  const now = Date.now();
  for (const [key, data] of clientRequestMap.entries()) {
    if (now - data.windowStart >= 60000) {
      clientRequestMap.delete(key);
    }
  }
}

setInterval(cleanupExpiredWindows, 60000);

function rateLimiter(req, res, next) {
  if (!RATE_LIMIT_ENABLED) {
    return next();
  }

  const clientKey = getClientKey(req);
  const now = Date.now();

  let clientData = clientRequestMap.get(clientKey);

  if (!clientData || now - clientData.windowStart >= 60000) {
    clientData = {
      windowStart: now,
      count: 0,
    };
    clientRequestMap.set(clientKey, clientData);
  }

  clientData.count += 1;

  const remaining = MAX_REQUESTS_PER_MINUTE - clientData.count;
  const resetTime = Math.ceil((clientData.windowStart + 60000 - now) / 1000);

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_MINUTE);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (clientData.count > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Maximum ${MAX_REQUESTS_PER_MINUTE} requests per minute allowed.`,
      retryAfter: resetTime,
    });
  }

  return next();
}

module.exports = {
  REQUESTS_PER_MINUTE: MAX_REQUESTS_PER_MINUTE,
  ENABLED: RATE_LIMIT_ENABLED,
  rateLimiter,
};
