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
