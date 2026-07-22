const securityConfig = require('../config/security');

/**
 * Security Configuration Validator
 * Validates and ensures proper security configuration at startup
 */

class SecurityValidator {
  constructor() {
    this.validationResults = {
      passed: [],
      warnings: [],
      errors: []
    };
  }

  /**
   * Validate all security configurations
   * @returns {Object} Validation results
   */
  validateAll() {
    this.validateEnvironmentVariables();
    this.validateEncryptionSettings();
    this.validateJWTConfiguration();
    this.validateRateLimitingSettings();
    this.validateSecurityHeaders();
    this.validateCORSConfiguration();

    return this.validationResults;
  }

  /**
   * Validate required environment variables
   */
  validateEnvironmentVariables() {
    const requiredVars = [
      'JWT_SECRET',
      'MONGO_URI',
      'NODE_ENV'
    ];

    const optionalVars = [
      'ENCRYPTION_KEY',
      'FRONTEND_URL',
      'REDIS_URL'
    ];

    // Check required variables
    requiredVars.forEach(varName => {
      if (!process.env[varName]) {
        this.validationResults.errors.push(
          `Missing required environment variable: ${varName}`
        );
      } else {
        this.validationResults.passed.push(
          `Required environment variable ${varName} is set`
        );
      }
    });

    // Check optional variables
    optionalVars.forEach(varName => {
      if (!process.env[varName]) {
        this.validationResults.warnings.push(
          `Optional environment variable ${varName} is not set`
        );
      } else {
        this.validationResults.passed.push(
          `Optional environment variable ${varName} is set`
        );
      }
    });
  }

  /**
   * Validate encryption settings
   */
  validateEncryptionSettings() {
    const encryptionKey = process.env.ENCRYPTION_KEY;

    if (!encryptionKey) {
      this.validationResults.warnings.push(
        'ENCRYPTION_KEY not set - PII fields will not be encrypted'
      );
      return;
    }

    if (encryptionKey.length < 32) {
      this.validationResults.errors.push(
        'ENCRYPTION_KEY must be at least 32 characters long'
      );
    } else {
      this.validationResults.passed.push(
        'ENCRYPTION_KEY meets minimum length requirements'
      );
    }

    // Check key entropy
    const entropy = this.calculateEntropy(encryptionKey);
    if (entropy < 4.0) {
      this.validationResults.warnings.push(
        `ENCRYPTION_KEY has low entropy (${entropy.toFixed(2)}). Consider using a more random key.`
      );
    } else {
      this.validationResults.passed.push(
        `ENCRYPTION_KEY has good entropy (${entropy.toFixed(2)})`
      );
    }
  }

  /**
   * Validate JWT configuration
   */
  validateJWTConfiguration() {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      this.validationResults.errors.push('JWT_SECRET is required');
      return;
    }

    if (jwtSecret.length < 32) {
      this.validationResults.errors.push(
        'JWT_SECRET should be at least 32 characters long'
      );
    } else {
      this.validationResults.passed.push(
        'JWT_SECRET meets minimum length requirements'
      );
    }

    // Check if JWT secret is too simple
    if (jwtSecret === 'your-secret-key' || jwtSecret === 'secret') {
      this.validationResults.errors.push(
        'JWT_SECRET appears to be a default value. Use a secure random string.'
      );
    }

    // Validate JWT expiration settings
    const expiresIn = securityConfig.auth.jwtExpiresIn;
    if (!expiresIn || expiresIn === '1y') {
      this.validationResults.warnings.push(
        'JWT expiration time is too long. Consider shorter expiration for better security.'
      );
    } else {
      this.validationResults.passed.push(
        `JWT expiration time is set to ${expiresIn}`
      );
    }
  }

  /**
   * Validate rate limiting settings
   */
  validateRateLimitingSettings() {
    const rateLimits = securityConfig.rateLimiting;

    // Check auth rate limiting
    if (rateLimits.auth.max > 10) {
      this.validationResults.warnings.push(
        `Auth rate limit (${rateLimits.auth.max}) might be too high for security`
      );
    } else {
      this.validationResults.passed.push(
        `Auth rate limiting is appropriately configured (${rateLimits.auth.max} attempts)`
      );
    }

    // Check OTP rate limiting
    if (rateLimits.otp.max > 5) {
      this.validationResults.warnings.push(
        `OTP rate limit (${rateLimits.otp.max}) might be too high`
      );
    } else {
      this.validationResults.passed.push(
        `OTP rate limiting is appropriately configured (${rateLimits.otp.max} requests)`
      );
    }
  }

  /**
   * Validate security headers configuration
   */
  validateSecurityHeaders() {
    const headers = securityConfig.headers;

    if (!headers.contentSecurityPolicy) {
      this.validationResults.warnings.push(
        'Content Security Policy is not configured'
      );
    } else {
      this.validationResults.passed.push(
        'Content Security Policy is configured'
      );
    }

    if (headers.hsts.maxAge < 31536000) { // 1 year
      this.validationResults.warnings.push(
        'HSTS max-age should be at least 1 year (31536000 seconds)'
      );
    } else {
      this.validationResults.passed.push(
        'HSTS is properly configured'
      );
    }
  }

  /**
   * Validate CORS configuration
   */
  validateCORSConfiguration() {
    const cors = securityConfig.cors;

    if (cors.allowedOrigins.includes('*')) {
      this.validationResults.errors.push(
        'CORS is configured to allow all origins (*). This is insecure for production.'
      );
    } else {
      this.validationResults.passed.push(
        'CORS origins are properly restricted'
      );
    }

    if (!cors.credentials) {
      this.validationResults.warnings.push(
        'CORS credentials are disabled. This might affect authentication.'
      );
    } else {
      this.validationResults.passed.push(
        'CORS credentials are enabled'
      );
    }
  }

  /**
   * Calculate entropy of a string
   * @param {string} str - String to analyze
   * @returns {number} Entropy value
   */
  calculateEntropy(str) {
    const freq = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;

    for (const char in freq) {
      const p = freq[char] / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * Generate security recommendations
   * @returns {Array} Array of recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (process.env.NODE_ENV === 'production') {
      recommendations.push(
        'Ensure HTTPS is enabled in production',
        'Use a proper session store (Redis) instead of in-memory storage',
        'Implement proper logging and monitoring',
        'Regular security audits and dependency updates',
        'Use environment-specific configuration files'
      );
    }

    if (!process.env.ENCRYPTION_KEY) {
      recommendations.push(
        'Set ENCRYPTION_KEY environment variable to enable PII encryption'
      );
    }

    if (!process.env.REDIS_URL) {
      recommendations.push(
        'Configure Redis for better session management and rate limiting'
      );
    }

    return recommendations;
  }

  /**
   * Print validation results to console
   */
  printResults() {
    console.log('\n🔒 Security Configuration Validation Results:');
    console.log('=' .repeat(50));

    if (this.validationResults.passed.length > 0) {
      console.log('\n✅ Passed Checks:');
      this.validationResults.passed.forEach(item => {
        console.log(`  ✓ ${item}`);
      });
    }

    if (this.validationResults.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.validationResults.warnings.forEach(item => {
        console.log(`  ⚠ ${item}`);
      });
    }

    if (this.validationResults.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.validationResults.errors.forEach(item => {
        console.log(`  ✗ ${item}`);
      });
    }

    const recommendations = this.generateRecommendations();
    if (recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      recommendations.forEach(item => {
        console.log(`  💡 ${item}`);
      });
    }

    console.log('\n' + '='.repeat(50));

    const totalChecks = this.validationResults.passed.length +
                       this.validationResults.warnings.length +
                       this.validationResults.errors.length;

    console.log(`Security Score: ${this.validationResults.passed.length}/${totalChecks} checks passed`);

    if (this.validationResults.errors.length > 0) {
      console.log('⚠️  Critical security issues detected. Please address errors before production deployment.');
    } else if (this.validationResults.warnings.length > 0) {
      console.log('⚠️  Some security improvements recommended.');
    } else {
      console.log('✅ All security checks passed!');
    }
  }

  /**
   * Check if configuration is production-ready
   * @returns {boolean} True if ready for production
   */
  isProductionReady() {
    return this.validationResults.errors.length === 0;
  }
}

module.exports = SecurityValidator;