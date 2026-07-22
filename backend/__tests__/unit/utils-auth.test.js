/**
 * UNIT TESTS for AuthUtils
 *
 * Tests individual authentication utility functions in isolation
 * - Password hashing and comparison
 * - JWT token generation and verification
 * - OTP generation
 * - Token payload creation
 *
 * Characteristics:
 * - Fast execution (<1 second per test)
 * - No external dependencies
 * - Mocked external services
 */

const AuthUtils = require('../../utils/auth');
const jwt = require('jsonwebtoken');

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-testing';

describe('AuthUtils - Password Hashing', () => {
    describe('hashPassword', () => {
        it('should hash password successfully', async () => {
            const password = 'testPassword123';
            const hashedPassword = await AuthUtils.hashPassword(password);

            expect(hashedPassword).toBeDefined();
            expect(hashedPassword).not.toBe(password);
            expect(hashedPassword.length).toBeGreaterThan(0);
        });

        it('should generate different hashes for same password', async () => {
            const password = 'testPassword123';
            const hash1 = await AuthUtils.hashPassword(password);
            const hash2 = await AuthUtils.hashPassword(password);

            expect(hash1).not.toBe(hash2);
        });

        it('should throw error for empty password', async () => {
            await expect(AuthUtils.hashPassword('')).rejects.toThrow('Password is required');
        });

        it('should throw error for null password', async () => {
            await expect(AuthUtils.hashPassword(null)).rejects.toThrow('Password is required');
        });

        it('should throw error for undefined password', async () => {
            await expect(AuthUtils.hashPassword(undefined)).rejects.toThrow('Password is required');
        });

        it('should use at least 10 salt rounds (security requirement)', async () => {
            const password = 'testPassword123';
            const hashedPassword = await AuthUtils.hashPassword(password);

            // Bcrypt hashes start with version and cost
            // Format: $2b$<cost>$...
            const cost = parseInt(hashedPassword.split('$')[2]);
            expect(cost).toBeGreaterThanOrEqual(10);
        });
    });

    describe('comparePassword', () => {
        it('should return true for correct password', async () => {
            const password = 'testPassword123';
            const hashedPassword = await AuthUtils.hashPassword(password);

            const isMatch = await AuthUtils.comparePassword(password, hashedPassword);
            expect(isMatch).toBe(true);
        });

        it('should return false for incorrect password', async () => {
            const password = 'testPassword123';
            const hashedPassword = await AuthUtils.hashPassword(password);

            const isMatch = await AuthUtils.comparePassword('wrongPassword', hashedPassword);
            expect(isMatch).toBe(false);
        });

        it('should return false for empty password', async () => {
            const hashedPassword = await AuthUtils.hashPassword('testPassword123');

            const isMatch = await AuthUtils.comparePassword('', hashedPassword);
            expect(isMatch).toBe(false);
        });

        it('should return false for empty hash', async () => {
            const isMatch = await AuthUtils.comparePassword('testPassword123', '');
            expect(isMatch).toBe(false);
        });

        it('should return false for null password', async () => {
            const hashedPassword = await AuthUtils.hashPassword('testPassword123');

            const isMatch = await AuthUtils.comparePassword(null, hashedPassword);
            expect(isMatch).toBe(false);
        });

        it('should handle case-sensitive password comparison', async () => {
            const password = 'TestPassword123';
            const hashedPassword = await AuthUtils.hashPassword(password);

            const isMatch = await AuthUtils.comparePassword('testpassword123', hashedPassword);
            expect(isMatch).toBe(false);
        });
    });
});

describe('AuthUtils - JWT Token Management', () => {
    describe('generateAccessToken', () => {
        it('should generate valid JWT token', () => {
            const payload = {
                userId: '123',
                email: 'test@example.com',
                role: 'rider'
            };

            const token = AuthUtils.generateAccessToken(payload);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3); // JWT has 3 parts
        });

        it('should generate token with default expiration (24h)', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateAccessToken(payload);

            const decoded = jwt.decode(token);

            expect(decoded.exp).toBeDefined();
            expect(decoded.iat).toBeDefined();

            // Check expiration is approximately 24 hours
            const expirationTime = decoded.exp - decoded.iat;
            expect(expirationTime).toBe(86400); // 24 hours in seconds
        });

        it('should generate token with custom expiration', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateAccessToken(payload, '1h');

            const decoded = jwt.decode(token);
            const expirationTime = decoded.exp - decoded.iat;

            expect(expirationTime).toBe(3600); // 1 hour in seconds
        });

        it('should include issuer and audience in token', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateAccessToken(payload);

            const decoded = jwt.decode(token);

            expect(decoded.iss).toBe('cab-aggregator');
            expect(decoded.aud).toBe('cab-aggregator-users');
        });

        it('should throw error if JWT_SECRET is not set', () => {
            const originalSecret = process.env.JWT_SECRET;
            delete process.env.JWT_SECRET;

            expect(() => {
                AuthUtils.generateAccessToken({ userId: '123' });
            }).toThrow('JWT_SECRET environment variable is required');

            process.env.JWT_SECRET = originalSecret;
        });
    });

    describe('generateRefreshToken', () => {
        it('should generate refresh token with 7 day expiration', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateRefreshToken(payload);

            const decoded = jwt.decode(token);
            const expirationTime = decoded.exp - decoded.iat;

            expect(expirationTime).toBe(604800); // 7 days in seconds
        });

        it('should generate valid refresh token', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateRefreshToken(payload);

            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.').length).toBe(3);
        });
    });

    describe('verifyToken', () => {
        it('should verify and decode valid token', () => {
            const payload = {
                userId: '123',
                email: 'test@example.com',
                role: 'rider'
            };

            const token = AuthUtils.generateAccessToken(payload);
            const decoded = AuthUtils.verifyToken(token);

            expect(decoded.userId).toBe(payload.userId);
            expect(decoded.email).toBe(payload.email);
            expect(decoded.role).toBe(payload.role);
        });

        it('should throw error for expired token', () => {
            const payload = { userId: '123' };
            const token = AuthUtils.generateAccessToken(payload, '-1h'); // Expired 1 hour ago

            expect(() => {
                AuthUtils.verifyToken(token);
            }).toThrow('Token has expired');
        });

        it('should throw error for invalid token', () => {
            expect(() => {
                AuthUtils.verifyToken('invalid.token.here');
            }).toThrow('Invalid token');
        });

        it('should throw error for malformed token', () => {
            expect(() => {
                AuthUtils.verifyToken('not-a-valid-jwt');
            }).toThrow('Invalid token');
        });

        it('should throw error for token with wrong signature', () => {
            const payload = { userId: '123' };
            const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '24h' });

            expect(() => {
                AuthUtils.verifyToken(token);
            }).toThrow('Invalid token');
        });

        it('should throw error if JWT_SECRET is not set', () => {
            const originalSecret = process.env.JWT_SECRET;
            delete process.env.JWT_SECRET;

            expect(() => {
                AuthUtils.verifyToken('some.token.here');
            }).toThrow('JWT_SECRET environment variable is required');

            process.env.JWT_SECRET = originalSecret;
        });
    });

    describe('extractTokenFromHeader', () => {
        it('should extract token from valid Bearer header', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
            const authHeader = `Bearer ${token}`;

            const extracted = AuthUtils.extractTokenFromHeader(authHeader);
            expect(extracted).toBe(token);
        });

        it('should return null for missing Bearer prefix', () => {
            const extracted = AuthUtils.extractTokenFromHeader('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
            expect(extracted).toBeNull();
        });

        it('should return null for empty header', () => {
            const extracted = AuthUtils.extractTokenFromHeader('');
            expect(extracted).toBeNull();
        });

        it('should return null for null header', () => {
            const extracted = AuthUtils.extractTokenFromHeader(null);
            expect(extracted).toBeNull();
        });

        it('should return null for undefined header', () => {
            const extracted = AuthUtils.extractTokenFromHeader(undefined);
            expect(extracted).toBeNull();
        });

        it('should handle Bearer with multiple spaces', () => {
            const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
            const authHeader = `Bearer  ${token}`;

            const extracted = AuthUtils.extractTokenFromHeader(authHeader);
            expect(extracted).toBe(` ${token}`);
        });
    });
});

describe('AuthUtils - OTP Generation', () => {
    describe('generateOTP', () => {
        it('should generate 6-digit OTP by default', () => {
            const otp = AuthUtils.generateOTP();

            expect(otp).toBeDefined();
            expect(otp.length).toBe(6);
            expect(/^\d{6}$/.test(otp)).toBe(true);
        });

        it('should generate OTP of custom length', () => {
            const otp = AuthUtils.generateOTP(4);

            expect(otp.length).toBe(4);
            expect(/^\d{4}$/.test(otp)).toBe(true);
        });

        it('should generate numeric OTP only', () => {
            const otp = AuthUtils.generateOTP(8);

            expect(/^\d+$/.test(otp)).toBe(true);
        });

        it('should generate different OTPs on subsequent calls', () => {
            const otp1 = AuthUtils.generateOTP();
            const otp2 = AuthUtils.generateOTP();

            // While theoretically they could be the same, probability is very low
            expect(otp1).not.toBe(otp2);
        });

        it('should generate OTP within valid range', () => {
            const otp = AuthUtils.generateOTP(6);
            const otpNumber = parseInt(otp);

            expect(otpNumber).toBeGreaterThanOrEqual(0);
            expect(otpNumber).toBeLessThanOrEqual(999999);
        });
    });
});

describe('AuthUtils - Token Payload Creation', () => {
    describe('createTokenPayload', () => {
        it('should create payload with essential user data', () => {
            const user = {
                _id: '123456789',
                phone: '+1234567890',
                email: 'test@example.com',
                role: 'rider',
                isVerified: true,
                isActive: true,
                password: 'hashed-password', // Should not be included
                otpSecret: 'secret' // Should not be included
            };

            const payload = AuthUtils.createTokenPayload(user);

            expect(payload.userId).toBe(user._id);
            expect(payload.phone).toBe(user.phone);
            expect(payload.email).toBe(user.email);
            expect(payload.role).toBe(user.role);
            expect(payload.isVerified).toBe(user.isVerified);
            expect(payload.isActive).toBe(user.isActive);
        });

        it('should not include sensitive data in payload', () => {
            const user = {
                _id: '123456789',
                phone: '+1234567890',
                email: 'test@example.com',
                role: 'rider',
                password: 'hashed-password',
                otpSecret: 'secret',
                isVerified: true,
                isActive: true
            };

            const payload = AuthUtils.createTokenPayload(user);

            expect(payload.password).toBeUndefined();
            expect(payload.otpSecret).toBeUndefined();
        });

        it('should handle user with missing optional fields', () => {
            const user = {
                _id: '123456789',
                phone: '+1234567890',
                role: 'rider',
                isVerified: true,
                isActive: true
            };

            const payload = AuthUtils.createTokenPayload(user);

            expect(payload.userId).toBe(user._id);
            expect(payload.email).toBeUndefined();
        });

        it('should handle driver role', () => {
            const driver = {
                _id: '987654321',
                phone: '+1987654321',
                email: 'driver@example.com',
                role: 'driver',
                isVerified: true,
                isActive: true,
                driverInfo: {
                    licenseNumber: 'DL123456'
                }
            };

            const payload = AuthUtils.createTokenPayload(driver);

            expect(payload.role).toBe('driver');
            expect(payload.driverInfo).toBeUndefined(); // Driver info should not be in token
        });
    });
});

describe('AuthUtils - Performance Tests', () => {
    it('should hash password in less than 1 second', async () => {
        const startTime = Date.now();
        await AuthUtils.hashPassword('testPassword123');
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(1000);
    });

    it('should generate token in less than 100ms', () => {
        const startTime = Date.now();
        AuthUtils.generateAccessToken({ userId: '123' });
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
    });

    it('should verify token in less than 100ms', () => {
        const token = AuthUtils.generateAccessToken({ userId: '123' });

        const startTime = Date.now();
        AuthUtils.verifyToken(token);
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(100);
    });

    it('should generate OTP in less than 10ms', () => {
        const startTime = Date.now();
        AuthUtils.generateOTP();
        const duration = Date.now() - startTime;

        expect(duration).toBeLessThan(10);
    });
});
