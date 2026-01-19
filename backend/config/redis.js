// config/redis.js
const redis = require('redis');

let redisClient = null;

// Decide whether to enable Redis:
// - If USE_REDIS is explicitly set to "true"/"false" use that
// - Otherwise default: enabled in production, disabled in development
const defaultUseRedis = process.env.NODE_ENV === 'production';
const USE_REDIS = (process.env.USE_REDIS ?? String(defaultUseRedis)) === 'true';

async function initRedis() {
  if (!USE_REDIS) {
    console.log('⚠️ Redis disabled by environment (USE_REDIS=false).');
    return null;
  }

  if (redisClient) return redisClient; // already created

  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      connectTimeout: 60000,
    },
    password: process.env.REDIS_PASSWORD || undefined,
    // don't set lazyConnect here — we want to attempt connect now
  });

  redisClient.on('error', (err) => {
    console.error('Redis error:', err && err.message ? err.message : err);
  });

  try {
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Redis connection failed in production:', err);
      throw err; // panic in prod (so process manager restarts)
    } else {
      console.warn('⚠️ Redis not available, continuing without cache:', err.message || err);
      redisClient = null; // fall back to null in dev
    }
  }

  return redisClient;
}

function getRedis() {
  return redisClient;
}

module.exports = { initRedis, getRedis, USE_REDIS };
