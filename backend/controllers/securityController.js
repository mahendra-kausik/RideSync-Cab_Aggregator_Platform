const { asyncHandler } = require('../middleware/errorHandler');
const securityLogger = require('../utils/securityLogger');
const sessionManager = require('../utils/sessionManager');
const encryptionUtils = require('../utils/encryption');
const { User } = require('../models');

/**
 * Security Management Controller
 * Handles security monitoring, reporting, and management endpoints
 */

/**
 * Get comprehensive security dashboard data
 */
const getSecurityDashboard = asyncHandler(async (req, res) => {
  const securityStats = await securityLogger.getSecurityStats();
  const sessionStats = await sessionManager.getStats();

  // Get user security metrics
  const userStats = await User.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
        adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
        driverUsers: { $sum: { $cond: [{ $eq: ['$role', 'driver'] }, 1, 0] } },
        riderUsers: { $sum: { $cond: [{ $eq: ['$role', 'rider'] }, 1, 0] } }
      }
    }
  ]);

  const userMetrics = userStats[0] || {
    totalUsers: 0,
    activeUsers: 0,
    verifiedUsers: 0,
    adminUsers: 0,
    driverUsers: 0,
    riderUsers: 0
  };

  // Calculate security score
  const securityScore = calculateSecurityScore(securityStats, sessionStats, userMetrics);

  res.json({
    success: true,
    data: {
      securityScore,
      securityEvents: securityStats,
      sessionManagement: sessionStats,
      userMetrics,
      encryptionStatus: {
        available: encryptionUtils.isAvailable(),
        algorithm: 'AES-256-GCM',
        keyRotationDue: false
      },
      systemHealth: {
        status: securityScore >= 80 ? 'healthy' : securityScore >= 60 ? 'warning' : 'critical',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      }
    },
    timestamp: new Date().toISOString()
  });
});

/**
 * Helper function to calculate security score
 */
function calculateSecurityScore(securityStats, sessionStats, userMetrics) {
  let score = 100;

  // Deduct points for security events
  const criticalEvents = securityStats.severityBreakdown?.critical || 0;
  const highEvents = securityStats.severityBreakdown?.high || 0;

  score -= criticalEvents * 10; // -10 points per critical event
  score -= highEvents * 5;      // -5 points per high event

  // Deduct points for session issues
  if (sessionStats.blacklistedTokens > 100) {
    score -= 10;
  }

  // Deduct points for unverified users
  const verificationRate = userMetrics.totalUsers > 0 ?
    (userMetrics.verifiedUsers / userMetrics.totalUsers) * 100 : 100;

  if (verificationRate < 80) {
    score -= (80 - verificationRate) / 2;
  }

  return Math.max(0, Math.min(100, score));
}

module.exports = {
  getSecurityDashboard
};