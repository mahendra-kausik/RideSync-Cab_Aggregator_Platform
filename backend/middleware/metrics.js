/**
 * Records HTTP request duration into the Prometheus histogram.
 */
const { httpRequestDuration } = require('../config/metrics');

// Use the matched route pattern (e.g. "/api/rides/:id"), not the raw URL, so
// requests with different IDs collapse into one label instead of an
// unbounded cardinality explosion.
function routeLabel(req) {
  return req.route ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
}

const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDuration.observe(
      { method: req.method, route: routeLabel(req), status_code: res.statusCode },
      durationSeconds
    );
  });

  next();
};

module.exports = metricsMiddleware;
