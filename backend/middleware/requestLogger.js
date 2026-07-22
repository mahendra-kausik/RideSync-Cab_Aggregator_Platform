/**
 * Request Logging Middleware
 * Logs all HTTP requests with performance metrics and security monitoring
 */

const logger = require('../utils/logger');

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Generate unique request ID if not present
  if (!req.get('X-Request-ID')) {
    req.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Log request start in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`📥 ${req.method} ${req.url} - Started`);
  }

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function (...args) {
    const responseTime = Date.now() - startTime;

    // Log the request
    logger.logRequest(req, res, responseTime);

    // Log slow requests
    if (responseTime > 2000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        responseTime: `${responseTime}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }

    // Call original end method
    originalEnd.apply(this, args);
  };

  // Security monitoring
  monitorSecurityEvents(req);

  next();
};

/**
 * Monitor for security events in requests
 */
function monitorSecurityEvents(req) {
  const userAgent = req.get('User-Agent') || '';
  const url = req.url.toLowerCase();
  const body = req.body || {};

  // Check for suspicious user agents
  const suspiciousAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'burp',
    'owasp',
    'dirbuster'
  ];

  if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
    logger.logSecurityEvent('SUSPICIOUS_USER_AGENT', {
      userAgent,
      ip: req.ip,
      url: req.url,
      method: req.method
    });
  }

  // Check for SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b)/i,
    /(UNION\s+SELECT)/i,
    /('\s*OR\s*'\s*=\s*')/i,
    /('\s*OR\s*1\s*=\s*1)/i,
    /(--|#|\/\*)/
  ];

  const checkForSQLInjection = (value) => {
    if (typeof value === 'string') {
      return sqlPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  // Check URL parameters
  if (sqlPatterns.some(pattern => pattern.test(url))) {
    logger.logSecurityEvent('SQL_INJECTION_ATTEMPT', {
      type: 'URL',
      url: req.url,
      ip: req.ip,
      userAgent
    });
  }

  // Check request body
  const checkObjectForInjection = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && checkForSQLInjection(value)) {
        logger.logSecurityEvent('SQL_INJECTION_ATTEMPT', {
          type: 'BODY',
          field: currentPath,
          value: value.substring(0, 100), // Limit logged value length
          ip: req.ip,
          userAgent,
          url: req.url
        });
      } else if (typeof value === 'object' && value !== null) {
        checkObjectForInjection(value, currentPath);
      }
    }
  };

  if (Object.keys(body).length > 0) {
    checkObjectForInjection(body);
  }

  // Check for XSS patterns
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi
  ];

  const checkForXSS = (value) => {
    if (typeof value === 'string') {
      return xssPatterns.some(pattern => pattern.test(value));
    }
    return false;
  };

  // Check for XSS in URL and body
  if (xssPatterns.some(pattern => pattern.test(url))) {
    logger.logSecurityEvent('XSS_ATTEMPT', {
      type: 'URL',
      url: req.url,
      ip: req.ip,
      userAgent
    });
  }

  const checkObjectForXSS = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && checkForXSS(value)) {
        logger.logSecurityEvent('XSS_ATTEMPT', {
          type: 'BODY',
          field: currentPath,
          value: value.substring(0, 100),
          ip: req.ip,
          userAgent,
          url: req.url
        });
      } else if (typeof value === 'object' && value !== null) {
        checkObjectForXSS(value, currentPath);
      }
    }
  };

  if (Object.keys(body).length > 0) {
    checkObjectForXSS(body);
  }

  // Check for path traversal attempts
  const pathTraversalPatterns = [
    /\.\.\//g,
    /\.\.\\/g,
    /%2e%2e%2f/gi,
    /%2e%2e%5c/gi
  ];

  if (pathTraversalPatterns.some(pattern => pattern.test(url))) {
    logger.logSecurityEvent('PATH_TRAVERSAL_ATTEMPT', {
      url: req.url,
      ip: req.ip,
      userAgent
    });
  }

  // Monitor for brute force attempts (handled by rate limiting, but log here too)
  if (req.url.includes('/auth/') && req.method === 'POST') {
    // This will be enhanced by rate limiting middleware
    logger.debug('Authentication attempt', {
      ip: req.ip,
      userAgent,
      endpoint: req.url
    });
  }
}

/**
 * Error request logger - logs failed requests with additional context
 */
const errorRequestLogger = (err, req, res, next) => {
  const responseTime = Date.now() - (req.startTime || Date.now());

  logger.error('Request failed', err, {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user ? req.user._id : null,
    requestId: req.get('X-Request-ID'),
    body: req.method !== 'GET' ? req.body : undefined
  });

  next(err);
};

module.exports = {
  requestLogger,
  errorRequestLogger
};