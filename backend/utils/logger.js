/**
 * Comprehensive Logging System
 * Provides structured logging for errors, requests, and system events
 */

const fs = require('fs');
const path = require('path');

/**
 * Log levels
 */
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

/**
 * Logger class for structured logging
 */
class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogsDirectory();
  }

  /**
   * Ensure logs directory exists
   */
  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * Get log file path for current date
   */
  getLogFilePath(type = 'general') {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logsDir, `${type}-${date}.log`);
  }

  /**
   * Format log entry
   */
  formatLogEntry(level, message, metadata = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development'
    }) + '\n';
  }

  /**
   * Write log to file
   */
  writeToFile(logEntry, type = 'general') {
    try {
      const logFile = this.getLogFilePath(type);
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Log error with full context
   */
  error(message, error = null, metadata = {}) {
    const logData = {
      ...metadata,
      error: error ? {
        message: error.message,
        stack: error.stack,
        code: error.code,
        name: error.name
      } : null
    };

    const logEntry = this.formatLogEntry(LOG_LEVELS.ERROR, message, logData);

    // Always log errors to console
    console.error(`🚨 ${message}`, error || '');

    // Write to error log file
    this.writeToFile(logEntry, 'error');
  }

  /**
   * Log warning
   */
  warn(message, metadata = {}) {
    const logEntry = this.formatLogEntry(LOG_LEVELS.WARN, message, metadata);

    if (process.env.NODE_ENV === 'development') {
      console.warn(`⚠️  ${message}`, metadata);
    }

    this.writeToFile(logEntry, 'warning');
  }

  /**
   * Log info
   */
  info(message, metadata = {}) {
    const logEntry = this.formatLogEntry(LOG_LEVELS.INFO, message, metadata);

    if (process.env.NODE_ENV === 'development') {
      console.log(`ℹ️  ${message}`, metadata);
    }

    this.writeToFile(logEntry, 'info');
  }

  /**
   * Log debug (only in development)
   */
  debug(message, metadata = {}) {
    if (process.env.NODE_ENV === 'development') {
      const logEntry = this.formatLogEntry(LOG_LEVELS.DEBUG, message, metadata);
      console.log(`🐛 ${message}`, metadata);
      this.writeToFile(logEntry, 'debug');
    }
  }

  /**
   * Log HTTP request
   */
  logRequest(req, res, responseTime) {
    const requestData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user ? req.user._id : null,
      userRole: req.user ? req.user.role : null,
      requestId: req.get('X-Request-ID')
    };

    const message = `${req.method} ${req.url} - ${res.statusCode} (${responseTime}ms)`;

    if (res.statusCode >= 400) {
      this.error(message, null, requestData);
    } else if (res.statusCode >= 300) {
      this.warn(message, requestData);
    } else {
      this.info(message, requestData);
    }
  }

  /**
   * Log security event
   */
  logSecurityEvent(event, metadata = {}) {
    const securityData = {
      event,
      ...metadata,
      severity: this.getSecuritySeverity(event)
    };

    const message = `Security Event: ${event}`;

    if (securityData.severity === 'HIGH') {
      this.error(message, null, securityData);
    } else {
      this.warn(message, securityData);
    }

    // Write to dedicated security log
    const logEntry = this.formatLogEntry(LOG_LEVELS.WARN, message, securityData);
    this.writeToFile(logEntry, 'security');
  }

  /**
   * Get security event severity
   */
  getSecuritySeverity(event) {
    const highSeverityEvents = [
      'BRUTE_FORCE_ATTEMPT',
      'UNAUTHORIZED_ACCESS',
      'INJECTION_ATTEMPT',
      'SUSPICIOUS_ACTIVITY'
    ];

    return highSeverityEvents.includes(event) ? 'HIGH' : 'MEDIUM';
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    const performanceData = {
      operation,
      duration: `${duration}ms`,
      ...metadata
    };

    const message = `Performance: ${operation} completed in ${duration}ms`;

    if (duration > 5000) { // Slow operation (>5s)
      this.warn(message, performanceData);
    } else {
      this.info(message, performanceData);
    }

    // Write to performance log
    const logEntry = this.formatLogEntry(LOG_LEVELS.INFO, message, performanceData);
    this.writeToFile(logEntry, 'performance');
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(operation, collection, duration, metadata = {}) {
    const dbData = {
      operation,
      collection,
      duration: `${duration}ms`,
      ...metadata
    };

    const message = `DB: ${operation} on ${collection} (${duration}ms)`;

    if (duration > 1000) { // Slow query (>1s)
      this.warn(message, dbData);
    } else {
      this.debug(message, dbData);
    }
  }

  /**
   * Clean old log files (keep last 30 days)
   */
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(this.logsDir);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      files.forEach(file => {
        const filePath = path.join(this.logsDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtime < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Cleaned old log file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Failed to clean old logs:', error.message);
    }
  }

  /**
   * Get log statistics
   */
  getLogStats() {
    try {
      const files = fs.readdirSync(this.logsDir);
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        filesByType: {}
      };

      files.forEach(file => {
        const filePath = path.join(this.logsDir, file);
        const fileStats = fs.statSync(filePath);
        const type = file.split('-')[0];

        stats.totalSize += fileStats.size;
        stats.filesByType[type] = (stats.filesByType[type] || 0) + 1;
      });

      stats.totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);

      return stats;
    } catch (error) {
      console.error('Failed to get log stats:', error.message);
      return null;
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Clean old logs on startup
logger.cleanOldLogs();

// Schedule daily log cleanup
setInterval(() => {
  logger.cleanOldLogs();
}, 24 * 60 * 60 * 1000); // 24 hours

module.exports = logger;