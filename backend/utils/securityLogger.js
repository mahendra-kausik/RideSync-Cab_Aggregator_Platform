const fs = require('fs').promises;
const path = require('path');

/**
 * Security Audit Logger
 * Logs security events for monitoring and compliance
 */

class SecurityLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.securityLogFile = path.join(this.logDir, 'security.log');
    this.auditLogFile = path.join(this.logDir, 'audit.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;

    this.initializeLogDirectory();
  }

  /**
   * Initialize log directory
   */
  async initializeLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error.message);
    }
  }

  /**
   * Log security event
   * @param {string} event - Event type
   * @param {Object} details - Event details
   * @param {string} severity - Event severity (low, medium, high, critical)
   */
  async logSecurityEvent(event, details, severity = 'medium') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      severity,
      details: {
        ...details,
        // Sanitize sensitive data
        password: details.password ? '[REDACTED]' : undefined,
        token: details.token ? '[REDACTED]' : undefined,
        otp: details.otp ? '[REDACTED]' : undefined
      }
    };

    await this.writeLog(this.securityLogFile, logEntry);

    // Also log to console for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔒 Security Event [${severity.toUpperCase()}]:`, event, logEntry.details);
    }
  }

  /**
   * Log audit event
   * @param {string} action - Action performed
   * @param {Object} details - Action details
   */
  async logAuditEvent(action, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      details: {
        ...details,
        // Ensure user identification without sensitive data
        userId: details.userId || 'anonymous',
        ip: details.ip || 'unknown',
        userAgent: details.userAgent || 'unknown'
      }
    };

    await this.writeLog(this.auditLogFile, logEntry);
  }

  /**
   * Write log entry to file
   * @param {string} logFile - Log file path
   * @param {Object} logEntry - Log entry object
   */
  async writeLog(logFile, logEntry) {
    try {
      const logLine = JSON.stringify(logEntry) + '\n';

      // Check file size and rotate if necessary
      await this.rotateLogIfNeeded(logFile);

      // Append to log file
      await fs.appendFile(logFile, logLine);
    } catch (error) {
      console.error('Failed to write log:', error.message);
    }
  }

  /**
   * Rotate log file if it exceeds maximum size
   * @param {string} logFile - Log file path
   */
  async rotateLogIfNeeded(logFile) {
    try {
      const stats = await fs.stat(logFile);

      if (stats.size > this.maxLogSize) {
        // Rotate logs
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
          const oldFile = `${logFile}.${i}`;
          const newFile = `${logFile}.${i + 1}`;

          try {
            await fs.rename(oldFile, newFile);
          } catch (error) {
            // File might not exist, continue
          }
        }

        // Move current log to .1
        await fs.rename(logFile, `${logFile}.1`);
      }
    } catch (error) {
      // File might not exist yet, continue
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(eventType, details) {
    const severity = this.getAuthEventSeverity(eventType);
    await this.logSecurityEvent(`AUTH_${eventType}`, details, severity);
  }

  /**
   * Log authorization events
   */
  async logAuthzEvent(eventType, details) {
    await this.logSecurityEvent(`AUTHZ_${eventType}`, details, 'medium');
  }

  /**
   * Log data access events
   */
  async logDataAccess(action, details) {
    await this.logAuditEvent(`DATA_${action}`, details);
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(activity, details) {
    await this.logSecurityEvent(`SUSPICIOUS_${activity}`, details, 'high');
  }

  /**
   * Log rate limit violations
   */
  async logRateLimitViolation(endpoint, details) {
    await this.logSecurityEvent('RATE_LIMIT_VIOLATION', {
      endpoint,
      ...details
    }, 'medium');
  }

  /**
   * Log admin actions
   */
  async logAdminAction(action, details) {
    await this.logAuditEvent(`ADMIN_${action}`, details);
  }

  /**
   * Get severity level for authentication events
   * @param {string} eventType - Event type
   * @returns {string} - Severity level
   */
  getAuthEventSeverity(eventType) {
    const severityMap = {
      'LOGIN_SUCCESS': 'low',
      'LOGIN_FAILED': 'medium',
      'REGISTRATION_SUCCESS': 'low',
      'REGISTRATION_FAILED': 'medium',
      'OTP_SENT': 'low',
      'OTP_VERIFIED': 'low',
      'OTP_FAILED': 'medium',
      'PASSWORD_RESET_REQUESTED': 'medium',
      'PASSWORD_RESET_SUCCESS': 'medium',
      'ACCOUNT_LOCKED': 'high',
      'MULTIPLE_FAILED_ATTEMPTS': 'high',
      'TOKEN_EXPIRED': 'low',
      'TOKEN_INVALID': 'medium',
      'SESSION_HIJACK_ATTEMPT': 'critical'
    };

    return severityMap[eventType] || 'medium';
  }

  /**
   * Get recent security events
   * @param {number} limit - Number of events to return
   * @param {string} severity - Filter by severity
   * @returns {Array} - Array of security events
   */
  async getRecentSecurityEvents(limit = 100, severity = null) {
    try {
      const data = await fs.readFile(this.securityLogFile, 'utf8');
      const lines = data.trim().split('\n').filter(line => line);

      let events = lines
        .slice(-limit * 2) // Get more lines to account for filtering
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(event => event !== null);

      // Filter by severity if specified
      if (severity) {
        events = events.filter(event => event.severity === severity);
      }

      // Return most recent events
      return events.slice(-limit).reverse();
    } catch (error) {
      console.error('Failed to read security log:', error.message);
      return [];
    }
  }

  /**
   * Get security statistics
   * @returns {Object} - Security statistics
   */
  async getSecurityStats() {
    try {
      const events = await this.getRecentSecurityEvents(1000);

      const stats = {
        totalEvents: events.length,
        severityBreakdown: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0
        },
        eventTypes: {},
        recentActivity: events.slice(0, 10)
      };

      events.forEach(event => {
        // Count by severity
        stats.severityBreakdown[event.severity] =
          (stats.severityBreakdown[event.severity] || 0) + 1;

        // Count by event type
        stats.eventTypes[event.event] =
          (stats.eventTypes[event.event] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('Failed to generate security stats:', error.message);
      return {
        totalEvents: 0,
        severityBreakdown: { low: 0, medium: 0, high: 0, critical: 0 },
        eventTypes: {},
        recentActivity: []
      };
    }
  }
}

// Create singleton instance
const securityLogger = new SecurityLogger();

module.exports = securityLogger;