// node load/breaker-trip.js
//
// Fault-injection run against GracefulDegradationService's maps circuit
// breaker (threshold 3, resetTimeout 30s — backend/services/
// GracefulDegradationService.js). Local-only: /api/test/* only mounts when
// NODE_ENV=development (backend/server.js), so this can't run against the
// live Render deploy without weakening prod gating — not worth it for a
// portfolio metric.
//
// Sequence: poll /health for the starting CLOSED state, fire failing
// requests at /api/test/external-service-test until the breaker reports
// OPEN, wait out resetTimeout while polling /health to try to catch the
// HALF_OPEN window, then fire one more request to show it re-opens (the
// test endpoint always injects a failure, so HALF_OPEN never has a chance
// to succeed back to CLOSED — that's an honest limitation of fault
// injection via this endpoint, not a bug).
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const RESET_TIMEOUT_MS = 30000; // must match CircuitBreaker('Maps Service', 3, 5000, 30000)

async function getMapsState() {
  const res = await fetch(`${BASE_URL}/health`);
  const body = await res.json();
  return body.externalServices.circuitBreakers.maps.state;
}

async function triggerFailure() {
  const res = await fetch(`${BASE_URL}/api/test/external-service-test`);
  if (res.status === 404) {
    throw new Error(
      '/api/test/external-service-test returned 404 — server must run with NODE_ENV=development'
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const observed = [];
  const record = async (label) => {
    const state = await getMapsState();
    console.log(`[${new Date().toISOString()}] ${label}: maps=${state}`);
    observed.push({ label, state, at: new Date().toISOString() });
    return state;
  };

  await record('start');

  for (let i = 1; i <= 3; i++) {
    await triggerFailure();
    await record(`after failure ${i}`);
  }

  const openedAt = Date.now();
  console.log(`Waiting ${RESET_TIMEOUT_MS}ms for resetTimeout, polling every 2s for HALF_OPEN...`);
  while (Date.now() - openedAt < RESET_TIMEOUT_MS + 2000) {
    await record('waiting');
    await sleep(2000);
  }

  await triggerFailure();
  await record('after reset-window probe');

  const states = observed.map((o) => o.state);
  console.log('--- breaker-trip results ---');
  console.log(JSON.stringify({
    sawClosed: states.includes('CLOSED'),
    sawOpen: states.includes('OPEN'),
    sawHalfOpen: states.includes('HALF_OPEN'),
    timeline: observed
  }, null, 2));
}

main().catch((err) => {
  console.error('breaker-trip failed:', err);
  process.exit(1);
});
