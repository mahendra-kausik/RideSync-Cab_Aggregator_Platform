// Shared Redis client for session storage, rate limiting, and the Socket.IO adapter.
// Exports null when REDIS_URL is unset so every consumer falls back to in-memory behavior.
const Redis = require('ioredis');

let client = null;

if (process.env.REDIS_URL) {
  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
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
