/**
 * Gate state store. Redis-backed so gate state survives process restarts.
 * Falls back to an in-memory Map when MOCK_EXTERNAL is set or Redis is
 * unreachable, so the demo runs without a Redis server.
 *
 * Keys are full strings (e.g. "gate:<id>", "gate2:<id>"); callers own the
 * prefix.
 */
const config = require('../config');

let mode = null; // 'redis' | 'memory'
let redis = null;
const mem = new Map();

async function init() {
  if (mode) return mode;

  if (config.demo.mockExternal) {
    mode = 'memory';
    return mode;
  }

  try {
    const { createClient } = require('redis');
    redis = createClient({
      url: config.redis.url,
      // don't retry forever if there's no server — fall back to memory instead
      socket: { reconnectStrategy: false },
    });
    redis.on('error', () => {}); // swallow; handled by connect() rejection
    await redis.connect();
    mode = 'redis';
  } catch {
    redis = null;
    mode = 'memory';
  }
  return mode;
}

async function get(key) {
  await init();
  if (mode === 'redis') {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  }
  return mem.has(key) ? JSON.parse(mem.get(key)) : null;
}

async function set(key, value, ttlSeconds) {
  await init();
  const s = JSON.stringify(value);
  if (mode === 'redis') {
    if (ttlSeconds) await redis.setEx(key, ttlSeconds, s);
    else await redis.set(key, s);
  } else {
    mem.set(key, s);
  }
}

async function update(key, partial) {
  const current = await get(key);
  if (!current) return null;
  const next = { ...current, ...partial };
  await set(key, next);
  return next;
}

async function close() {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      /* ignore */
    }
    redis = null;
    mode = null;
  }
}

module.exports = { get, set, update, close, getMode: () => mode };
