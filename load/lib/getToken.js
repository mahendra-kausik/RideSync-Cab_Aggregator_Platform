// Logs in as the seeded demo rider (backend/scripts/seed.js) and returns a JWT
// access token. Reused by ws-hold.js and breaker-trip.js so both scripts poll
// against a real authenticated session instead of hand-rolling JWTs.
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function getRiderToken() {
  const res = await fetch(`${BASE_URL}/api/auth/login-phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+1234567890', password: 'rider123' })
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`Demo rider login failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.tokens.accessToken;
}

module.exports = { getRiderToken, BASE_URL };
