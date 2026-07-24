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
    lazyConnect: false,
    // ponytail: tuned by observation, not a principled formula. Default ioredis
    // retryStrategy (times*50, capped 2000ms) reconnects fast enough across 3
    // near-simultaneous clients (this + Socket.IO adapter's pub/sub duplicates)
    // that it can look like it's tripping a connection-rate guard on Upstash's
    // side, resetting the new connection almost immediately and perpetuating the
    // loop instead of settling (P-006). Slower pacing gives it room to stabilize.
    retryStrategy: (times) => Math.min(times * 500, 15000),
    // TCP keepalive so an established connection stays alive at the network
    // layer instead of silently going idle and getting dropped (P-006's
    // original stale-connection hypothesis).
    keepAlive: 10000
  });

  client.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('✅ Redis connected');
  });
}

module.exports = client;
