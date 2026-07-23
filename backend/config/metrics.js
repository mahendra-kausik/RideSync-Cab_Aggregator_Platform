/**
 * Prometheus metrics registry (Layer 4 observability).
 * Scraped via GET /metrics (see server.js).
 */
const client = require('prom-client');
const gracefulDegradation = require('../services/GracefulDegradationService');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

const rideMatchDuration = new client.Histogram({
  name: 'ride_match_duration_seconds',
  help: 'Duration of the driver-matching search (MatchingService.findNearestDriver) in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [register]
});

const CIRCUIT_BREAKER_STATE_VALUE = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };

// Pull-based: read live circuit-breaker state straight from
// GracefulDegradationService on every scrape instead of pushing on every
// state transition — one less thing for the breaker to know about.
new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state per external service: 0=CLOSED, 1=HALF_OPEN, 2=OPEN',
  labelNames: ['service'],
  registers: [register],
  collect() {
    const { circuitBreakers } = gracefulDegradation.getHealthStatus();
    for (const [service, status] of Object.entries(circuitBreakers)) {
      this.set({ service }, CIRCUIT_BREAKER_STATE_VALUE[status.state]);
    }
  }
});

module.exports = { register, httpRequestDuration, rideMatchDuration };
