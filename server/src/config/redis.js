require('dotenv').config();
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let isConnected = false;

// Main Redis command client
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  lazyConnect: false,
});

// Dedicated Subscriber instance for Redis keyspace events (e.g. expired locks)
const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect', () => {
  isConnected = true;
  console.log(`[Redis]: Connected to server at ${REDIS_URL}`);
});

redis.on('ready', () => {
  isConnected = true;
  console.log('[Redis]: Client is ready to accept commands');
});

redis.on('error', (err) => {
  isConnected = false;
  console.error('[Redis Error]:', err.message);
});

redis.on('close', () => {
  isConnected = false;
  console.warn('[Redis]: Connection closed');
});

/**
 * Check if Redis is actively connected
 * @returns {boolean}
 */
const isRedisConnected = () => isConnected;

module.exports = {
  redis,
  redisSub,
  isRedisConnected,
};
