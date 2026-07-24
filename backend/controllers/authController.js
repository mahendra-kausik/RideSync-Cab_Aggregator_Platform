const { User, OTP } = require('../models');
const AuthUtils = require('../utils/auth');
const sessionManager = require('../utils/sessionManager');
const securityLogger = require('../utils/securityLogger');
const loginLockout = require('../utils/loginLockout');
const Joi = require('joi');

/**
 * Authentication Controller
 * Handles user registration, login, OTP verification, and password management
 */

// Validation schemas
const phoneRegistrationSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\d{10}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be exactly 10 digits, no country code or symbols.',
      'any.required': 'Phone number is required'
    }),
  profile: Joi.object({
    name: Joi.string()
      .min(2)
      .max(100)
      .trim()
      .pattern(/^[a-zA-Z\s'.-]+$/)
      .required()
      .messages({
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name cannot exceed 100 characters',
        'string.pattern.base': 'Name can only contain letters, spaces, apostrophes, periods, and hyphens',
        'any.required': 'Name is required'
      }),
    avatar: Joi.string().uri().optional()
  }).required(),
  role: Joi.string()
    .valid('rider', 'driver')
    .default('rider')
    .messages({
      'any.only': 'Role must be either rider or driver'
    }),
  // Driver-specific fields (conditional validation)
  driverInfo: Joi.when('role', {
    is: 'driver',
    then: Joi.object({
      licenseNumber: Joi.string()
        .required()
        .min(5)
        .max(20)
        .trim()
        .pattern(/^[a-zA-Z0-9-]+$/)
        .messages({
          'string.pattern.base': 'License number can only contain letters, numbers, and hyphens'
        }),
      vehicleDetails: Joi.object({
        make: Joi.string().required().max(30).trim().pattern(/^[a-zA-Z\s-]+$/)
          .messages({ 'string.pattern.base': 'Vehicle make can only contain letters, spaces, and hyphens' }),
        model: Joi.string().required().max(30).trim().pattern(/^[a-zA-Z0-9\s-]+$/)
          .messages({ 'string.pattern.base': 'Vehicle model can only contain letters, numbers, spaces, and hyphens' }),
        plateNumber: Joi.string().required().max(15).trim().pattern(/^[a-zA-Z0-9\s-]+$/)
          .messages({ 'string.pattern.base': 'Plate number can only contain letters, numbers, spaces, and hyphens' }),
        color: Joi.string().required().max(20).trim().pattern(/^[a-zA-Z\s-]+$/)
          .messages({ 'string.pattern.base': 'Vehicle color can only contain letters, spaces, and hyphens' })
      }).required()
    }).required(),
    otherwise: Joi.forbidden()
  })
});

const otpVerificationSchema = Joi.object({
  phone: Joi.string()
    .pattern(/^\d{10}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be exactly 10 digits, no country code or symbols.'
    }),
  otp: Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'OTP must be 6 digits'
    }),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-zA-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password cannot exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one letter and one number'
    }),
  tempUserData: Joi.object({
    phone: Joi.string().optional(),
    name: Joi.string().optional(),
    role: Joi.string().valid('rider', 'driver').optional(),
    licenseNumber: Joi.string().optional(),
    vehicleDetails: Joi.object({
      make: Joi.string().optional(),
      model: Joi.string().optional(),
      plateNumber: Joi.string().optional(),
      color: Joi.string().optional()
    }).optional()
  }).optional()
});

const emailLoginSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } }) // Allow any TLD including .local
    .required()
    .messages({
      'string.email': 'Invalid email format'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': 'Password is required'
    })
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } }) // Allow any TLD including .local
    .required()
});

/**
 * Register user with phone number and send OTP
 * POST /api/auth/register-phone
 */
const registerPhone = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = phoneRegistrationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { phone, profile, role, driverInfo } = value;
    const name = profile.name;
    const licenseNumber = driverInfo?.licenseNumber;
    const vehicleDetails = driverInfo?.vehicleDetails;

    // Check if user already exists (using phone_hash for query)
    const existingUser = await User.findByPhone(phone);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'User with this phone number already exists',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Generate and store OTP
    const { otp, expiresAt } = await OTP.createOTP(phone);

    // Simulate SMS sending by logging to console (as per requirements)
    console.log(`📱 SMS Simulation - OTP for ${phone}: ${otp}`);
    console.log(`⏰ OTP expires at: ${expiresAt}`);

    // Store user data temporarily in session/cache (for demo, we'll include in response)
    // In production, this would be stored in Redis or similar
    const tempUserData = {
      phone,
      name,
      role,
      ...(role === 'driver' && { licenseNumber, vehicleDetails })
    };

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phone,
        otpSent: true,
        expiresAt,
        // Include temp data for demo purposes
        tempUserData: process.env.NODE_ENV === 'development' ? tempUserData : undefined
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Phone registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to process registration',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Verify OTP and complete user registration
 * POST /api/auth/verify-otp
 */
const verifyOTP = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = otpVerificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { phone, otp, password } = value;
    const { tempUserData } = req.body; // Temporary user data from registration

    // Find valid OTP
    const otpDoc = await OTP.findOne({
      phone,
      otp,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpDoc) {
      // Check if OTP exists but is expired or used
      const expiredOtp = await OTP.findOne({ phone, otp });
      if (expiredOtp) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'OTP_EXPIRED',
            message: 'OTP has expired or already been used',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Increment attempts for rate limiting
      await OTP.updateOne(
        { phone, isUsed: false },
        { $inc: { attempts: 1 } }
      );

      // Check if max attempts reached
      const attemptDoc = await OTP.findOne({ phone, isUsed: false });
      if (attemptDoc && attemptDoc.attempts >= 3) {
        await OTP.updateMany({ phone }, { isUsed: true });

        // Log multiple failed attempts
        await securityLogger.logAuthEvent('MULTIPLE_FAILED_ATTEMPTS', {
          phone,
          attempts: attemptDoc.attempts,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(429).json({
          success: false,
          error: {
            code: 'MAX_ATTEMPTS_EXCEEDED',
            message: 'Maximum OTP attempts exceeded. Please request a new OTP.',
            timestamp: new Date().toISOString()
          }
        });
      }

      // Log failed OTP attempt
      await securityLogger.logAuthEvent('OTP_FAILED', {
        phone,
        attempts: (attemptDoc?.attempts || 0) + 1,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Invalid OTP provided',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Mark OTP as used
    otpDoc.isUsed = true;
    await otpDoc.save();

    // Create user account
    const userData = {
      phone,
      password,
      profile: {
        name: tempUserData?.name || 'User'
      },
      role: tempUserData?.role || 'rider',
      isVerified: true,
      isActive: true
    };

    // Add driver-specific data if applicable
    if (userData.role === 'driver' && tempUserData) {
      userData.driverInfo = {
        licenseNumber: tempUserData.licenseNumber,
        vehicleDetails: tempUserData.vehicleDetails,
        isAvailable: true,
        currentLocation: {
          type: 'Point',
          coordinates: [0, 0] // Default coordinates, to be updated later
        }
      };
    }

    const user = new User(userData);
    await user.save();

    // Create secure session
    const deviceInfo = req.get('User-Agent') || 'unknown';
    const session = await sessionManager.createSession(user, deviceInfo);

    // Log successful registration
    await securityLogger.logAuthEvent('REGISTRATION_SUCCESS', {
      userId: user._id,
      phone: user.phone,
      role: user.role,
      ip: req.ip,
      userAgent: deviceInfo
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      message: 'Account created and verified successfully',
      data: {
        user: userResponse,
        tokens: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn
        },
        sessionId: session.sessionId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'Failed to verify OTP',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Admin login with email and password
 * POST /api/auth/login-email
 */
const loginEmail = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = emailLoginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { email, password } = value;

    // Find user by email (include password for comparison) - uses email_hash
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      // Log failed login attempt
      await securityLogger.logAuthEvent('LOGIN_FAILED', {
        email,
        reason: 'user_not_found',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if account is active
    if (!user.isActive) {
      // Log suspended account access attempt
      await securityLogger.logAuthEvent('ACCOUNT_LOCKED', {
        userId: user._id,
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Account has been suspended',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check account lockout (IP+account-scoped brute-force protection)
    if (await loginLockout.isLocked(req.ip, email)) {
      await securityLogger.logAuthEvent('ACCOUNT_LOCKED', {
        userId: user._id,
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(423).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed login attempts. Try again later.',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      const locked = await loginLockout.recordFailedLogin(req.ip, email);

      // Log failed password attempt
      await securityLogger.logAuthEvent('LOGIN_FAILED', {
        userId: user._id,
        email,
        reason: 'invalid_password',
        locked,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    await loginLockout.resetFailedLogins(req.ip, email);

    // Create secure session
    const deviceInfo = req.get('User-Agent') || 'unknown';
    const session = await sessionManager.createSession(user, deviceInfo);

    // Log successful login
    await securityLogger.logAuthEvent('LOGIN_SUCCESS', {
      userId: user._id,
      email,
      role: user.role,
      ip: req.ip,
      userAgent: deviceInfo,
      sessionId: session.sessionId
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        tokens: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn
        },
        sessionId: session.sessionId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Email login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to process login',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Phone login for riders and drivers
 * POST /api/auth/login-phone
 */
const loginPhone = async (req, res) => {
  try {
    // Validate request body
    const phoneLoginSchema = Joi.object({
      phone: Joi.string()
        .pattern(/^\d{10}$/)
        .required()
        .messages({
          'string.pattern.base': 'Phone number must be exactly 10 digits, no country code or symbols.'
        }),
      password: Joi.string()
        .required()
        .messages({
          'any.required': 'Password is required'
        })
    });

    const { error, value } = phoneLoginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { phone, password } = value;

    // Find user by phone (include password for comparison) - uses phone_hash
    const user = await User.findByPhone(phone).select('+password');
    if (!user) {
      // Log failed login attempt
      await securityLogger.logAuthEvent('LOGIN_FAILED', {
        phone,
        reason: 'user_not_found',
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid phone number or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check if account is active
    if (!user.isActive) {
      // Log suspended account access attempt
      await securityLogger.logAuthEvent('ACCOUNT_LOCKED', {
        userId: user._id,
        phone,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Account has been suspended',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check account lockout (IP+account-scoped brute-force protection)
    if (await loginLockout.isLocked(req.ip, phone)) {
      await securityLogger.logAuthEvent('ACCOUNT_LOCKED', {
        userId: user._id,
        phone,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(423).json({
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed login attempts. Try again later.',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      const locked = await loginLockout.recordFailedLogin(req.ip, phone);

      // Log failed password attempt
      await securityLogger.logAuthEvent('LOGIN_FAILED', {
        userId: user._id,
        phone,
        reason: 'invalid_password',
        locked,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid phone number or password',
          timestamp: new Date().toISOString()
        }
      });
    }

    await loginLockout.resetFailedLogins(req.ip, phone);

    // Create secure session
    const deviceInfo = req.get('User-Agent') || 'unknown';
    const session = await sessionManager.createSession(user, deviceInfo);

    // Log successful login
    await securityLogger.logAuthEvent('LOGIN_SUCCESS', {
      userId: user._id,
      phone,
      role: user.role,
      ip: req.ip,
      userAgent: deviceInfo,
      sessionId: session.sessionId
    });

    // Remove password from response
    const userResponse = user.toJSON();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        tokens: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn
        },
        sessionId: session.sessionId
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Phone login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to process login',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Forgot password for admin users
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    // Validate request body
    const { error, value } = forgotPasswordSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.details[0].message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { email } = value;

    // Find admin user (uses email_hash)
    const user = await User.findByEmail(email);
    if (!user || user.role !== 'admin') {
      // Don't reveal if email exists for security
      return res.status(200).json({
        success: true,
        message: 'If the email exists, password reset instructions have been sent',
        timestamp: new Date().toISOString()
      });
    }

    // Generate reset token (in production, this would be a secure random token)
    const resetToken = AuthUtils.generateAccessToken(
      { userId: user._id, type: 'password_reset' },
      '1h'
    );

    // Simulate email sending by logging to console (as per requirements)
    console.log(`📧 Email Simulation - Password Reset for ${email}`);
    console.log(`🔗 Reset Link: http://localhost:3000/reset-password?token=${resetToken}`);
    console.log('⏰ Reset token expires in 1 hour');

    res.status(200).json({
      success: true,
      message: 'Password reset instructions sent to email',
      data: {
        // Include reset token for development purposes
        resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FORGOT_PASSWORD_FAILED',
        message: 'Failed to process forgot password request',
        timestamp: new Date().toISOString()
      }
    });
  }
};

/**
 * Development-only endpoint to retrieve OTP for testing
 * GET /api/auth/dev/otp/:phone
 */
const getDevOTP = async (req, res) => {
  // Only available in development environment
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        timestamp: new Date().toISOString()
      }
    });
  }

  try {
    const { phone } = req.params;

    // Validate phone number format
    if (!/^\d{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PHONE',
          message: 'Invalid phone number format',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Find latest unused OTP for the phone number
    const otpDoc = await OTP.findOne({
      phone,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'OTP_NOT_FOUND',
          message: 'No valid OTP found for this phone number',
          timestamp: new Date().toISOString()
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP retrieved successfully',
      data: {
        phone,
        otp: otpDoc.otp,
        expiresAt: otpDoc.expiresAt,
        attempts: otpDoc.attempts
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Dev OTP retrieval error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'OTP_RETRIEVAL_FAILED',
        message: 'Failed to retrieve OTP',
        timestamp: new Date().toISOString()
      }
    });
  }
};

module.exports = {
  registerPhone,
  verifyOTP,
  loginEmail,
  loginPhone,
  forgotPassword,
  getDevOTP,
  /**
   * Verify current access token and return user profile
   * GET /api/auth/verify
   */
  verifyToken: async (req, res) => {
    try {
      // `authenticateToken` middleware attaches user to req
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication required',
            timestamp: new Date().toISOString()
          }
        });
      }

      const user = req.user.toJSON ? req.user.toJSON() : req.user;
      delete user.password;

      return res.status(200).json({
        success: true,
        data: { user },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'TOKEN_VERIFICATION_FAILED',
          message: 'Failed to verify token',
          timestamp: new Date().toISOString()
        }
      });
    }
  }
};