const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Authentication utility functions
 * Implements bcrypt password hashing with minimum 10 salt rounds
 * and JWT token generation/validation
 */

class AuthUtils {
  /**
   * Hash password using bcrypt with minimum 10 salt rounds
   * @param {string} password - Plain text password
   * @returns {Promise<string>} - Hashed password
   */
  static async hashPassword(password) {
    if (!password) {
      throw new Error('Password is required');
    }

    const saltRounds = 12; // Exceeds minimum requirement of 10
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare plain text password with hashed password
   * @param {string} password - Plain text password
   * @param {string} hashedPassword - Hashed password from database
   * @returns {Promise<boolean>} - True if passwords match
   */
  static async comparePassword(password, hashedPassword) {
    if (!password || !hashedPassword) {
      return false;
    }

    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generate JWT access token
   * @param {Object} payload - Token payload (user data)
   * @param {string} expiresIn - Token expiration time
   * @returns {string} - JWT token
   */
  static generateAccessToken(payload, expiresIn = '24h') {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.sign(payload, secret, {
      expiresIn,
      issuer: 'cab-aggregator',
      audience: 'cab-aggregator-users'
    });
  }

  /**
   * Generate JWT refresh token (longer expiration)
   * @param {Object} payload - Token payload (user data)
   * @returns {string} - JWT refresh token
   */
  static generateRefreshToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.sign(payload, secret, {
      expiresIn: '7d',
      issuer: 'cab-aggregator',
      audience: 'cab-aggregator-users'
    });
  }

  /**
   * Verify and decode JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} - Decoded token payload
   */
  static verifyToken(token) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    try {
      return jwt.verify(token, secret, {
        issuer: 'cab-aggregator',
        audience: 'cab-aggregator-users'
      });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  /**
   * Extract token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} - Extracted token or null
   */
  static extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Generate secure random OTP
   * @param {number} length - OTP length (default: 6)
   * @returns {string} - Generated OTP
   */
  static generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';

    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }

    return otp;
  }

  /**
   * Create user token payload (excludes sensitive data)
   * @param {Object} user - User document
   * @returns {Object} - Token payload
   */
  static createTokenPayload(user) {
    return {
      userId: user._id,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive
    };
  }
}

module.exports = AuthUtils;