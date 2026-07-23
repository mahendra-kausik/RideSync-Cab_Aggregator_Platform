const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const securityLogger = require('../utils/securityLogger');
const sessionManager = require('../utils/sessionManager');
const { getSecurityDashboard } = require('../controllers/securityController');

const router = express.Router();

/**
 * Security Management Routes
 * Admin-only endpoints for monitoring and managing security
 */

/**
 * @route   GET /api/security/events
 * @desc    Get recent security events
 * @access  Private (Admin only)
 */
router.get('/events',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { limit = 100, severity } = req.query;

    const events = await securityLogger.getRecentSecurityEvents(
      parseInt(limit),
      severity
    );

    res.json({
      success: true,
      data: {
        events,
        total: events.length
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route   GET /api/security/stats
 * @desc    Get security statistics
 * @access  Private (Admin only)
 */
router.get('/stats',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const securityStats = await securityLogger.getSecurityStats();
    const sessionStats = await sessionManager.getStats();

    res.json({
      success: true,
      data: {
        security: securityStats,
        sessions: sessionStats,
        timestamp: new Date().toISOString()
      }
    });
  })
);

/**
 * @route   GET /api/security/dashboard
 * @desc    Get comprehensive security dashboard
 * @access  Private (Admin only)
 */
router.get('/dashboard',
  requireAuth,
  requireAdmin,
  getSecurityDashboard
);

/**
 * @route   GET /api/security/sessions
 * @desc    Get active sessions for all users
 * @access  Private (Admin only)
 */
router.get('/sessions',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    // Note: This would need to be implemented in sessionManager
    // For now, return session statistics
    const stats = await sessionManager.getStats();

    res.json({
      success: true,
      data: {
        activeSessions: stats.activeSessions,
        blacklistedTokens: stats.blacklistedTokens,
        message: 'Detailed session listing requires Redis implementation'
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route   POST /api/security/sessions/:sessionId/invalidate
 * @desc    Invalidate a specific session
 * @access  Private (Admin only)
 */
router.post('/sessions/:sessionId/invalidate',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;

    await sessionManager.invalidateSession(sessionId);

    // Log admin action
    await securityLogger.logAdminAction('SESSION_INVALIDATED', {
      adminId: req.user._id,
      targetSessionId: sessionId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Session invalidated successfully',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route   POST /api/security/users/:userId/invalidate-sessions
 * @desc    Invalidate all sessions for a user
 * @access  Private (Admin only)
 */
router.post('/users/:userId/invalidate-sessions',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    await sessionManager.invalidateUserSessions(userId);

    // Log admin action
    await securityLogger.logAdminAction('USER_SESSIONS_INVALIDATED', {
      adminId: req.user._id,
      targetUserId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'All user sessions invalidated successfully',
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * @route   GET /api/security/health
 * @desc    Security health check
 * @access  Private (Admin only)
 */
router.get('/health',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stats = await securityLogger.getSecurityStats();
    const sessionStats = await sessionManager.getStats();

    // Determine health status based on security events
    const criticalEvents = stats.severityBreakdown.critical || 0;
    const highEvents = stats.severityBreakdown.high || 0;

    let healthStatus = 'healthy';
    const alerts = [];

    if (criticalEvents > 0) {
      healthStatus = 'critical';
      alerts.push(`${criticalEvents} critical security events detected`);
    } else if (highEvents > 5) {
      healthStatus = 'warning';
      alerts.push(`${highEvents} high-severity security events detected`);
    }

    if (sessionStats.activeSessions > 1000) {
      alerts.push('High number of active sessions');
    }

    res.json({
      success: true,
      data: {
        status: healthStatus,
        alerts,
        metrics: {
          securityEvents: stats.totalEvents,
          activeSessions: sessionStats.activeSessions,
          blacklistedTokens: sessionStats.blacklistedTokens
        }
      },
      timestamp: new Date().toISOString()
    });
  })
);

module.exports = router;