// Shared Redis client for session storage, rate limiting, and the Socket.IO adapter.
// Exports null when REDIS_URL is unset so every consumer falls back to in-memory behavior.
const Redis = require('ioredis');

let client = null;

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    // null = commands wait for reconnection instead of throwing after N tries.
    // Cold boot opens 3 connections (this client + the Socket.IO adapter's
    // pub/sub duplicates) near-simultaneously, which can trigger transient
    // ECONNRESET churn on Upstash — a bounded retry count turned that into a
    // fatal unhandled rejection (P-005) instead of a brief, self-healing delay.
    maxRetriesPerRequest: null,
    // Bounds each command's wait to 5s. Without this, a command sent on a
    // connection that looks open but is actually stale/half-dead (Upstash
    // silently drops idle connections) would wait forever alongside
    // maxRetriesPerRequest: null above, hanging every request that touches
    // Redis (rate limiter, sessions) — see P-006.
    commandTimeout: 5000,
    lazyConnect: false
  });

  client.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('✅ Redis connected');
  });
}

module.exports = client;
