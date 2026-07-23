// k6 run load/rest-ramp.js
//
// Two scenarios, not one:
//  - health_ramp: GET /health, mounted directly on `app` (server.js:139) —
//    outside `app.use('/api', apiAbuseDetection)` and every named
//    rate-limiter — so it's the honest target for sustained req/s.
//  - estimate_capped: POST /api/rides/estimate. The route itself carries no
//    *named* rate limiter, but two other gates sit in front of every /api/*
//    route: `apiRateLimiter` (100 req per 15 min per IP+User-Agent,
//    Redis-backed via rate-limit-redis so it survives a server restart —
//    backend/middleware/security.js:155) and `apiAbuseDetection` (100
//    req/min, in-memory, self-perpetuating once tripped —
//    backend/middleware/advancedSecurity.js:305). The binding constraint is
//    the 15-minute window, not the 1-minute one. A ramp that ignores it
//    just measures 429s (confirmed by running it). So this scenario stays a
//    handful of requests per minute — comfortably under both caps — to
//    report real business-logic latency instead of a throughput number.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// NYC coords, >100m apart (fareEstimateSchema requires >= 0.1km).
const estimatePayload = JSON.stringify({
  pickup: { coordinates: [-74.006, 40.7128] },
  destination: { coordinates: [-73.996, 40.7589] }
});
const jsonHeaders = { headers: { 'Content-Type': 'application/json' } };

export const options = {
  scenarios: {
    health_ramp: {
      executor: 'ramping-arrival-rate',
      exec: 'healthCheck',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { target: 20, duration: '30s' },
        { target: 50, duration: '1m' },
        { target: 100, duration: '1m' },
        { target: 0, duration: '15s' }
      ]
    },
    estimate_capped: {
      executor: 'constant-arrival-rate',
      exec: 'fareEstimate',
      rate: 1, // 4/min ≈ 11 requests over the run, well under apiRateLimiter's 100/15min
      timeUnit: '15s',
      duration: '2m45s',
      preAllocatedVUs: 2,
      maxVUs: 5
    }
  },
  thresholds: {
    'http_req_duration{scenario:health_ramp}': ['p(95)<500'],
    'http_req_failed{scenario:health_ramp}': ['rate<0.01'],
    'http_req_duration{scenario:estimate_capped}': ['p(95)<500'],
    'http_req_failed{scenario:estimate_capped}': ['rate<0.01']
  }
};

export function healthCheck() {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { 'health 200': (r) => r.status === 200 });
}

export function fareEstimate() {
  const res = http.post(`${BASE_URL}/api/rides/estimate`, estimatePayload, jsonHeaders);
  check(res, { 'estimate 200': (r) => r.status === 200 });
}
