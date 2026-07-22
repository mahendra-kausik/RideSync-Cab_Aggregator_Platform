/**
 * UNIT TESTS for Authentication Middleware
 *
 * Tests auth middleware with mocked dependencies
 * - Token authentication
 * - Role-based authorization
 * - User verification
 * - Error handling
 *
 * Characteristics:
 * - Fast execution (<1 second per test)
 * - Mocked User model and external services
 * - Isolated middleware testing
 */

const authMiddleware = require('../../middleware/auth');
const AuthUtils = require('../../utils/auth');

// Mock dependencies
jest.mock('../../models', () => ({
    User: {
        findById: jest.fn()
    }
}));

jest.mock('../../utils/sessionManager', () => ({
    validateSession: jest.fn()
}));

jest.mock('../../utils/securityLogger', () => ({
    logAuthEvent: jest.fn().mockResolvedValue(undefined)
}));

const { User } = require('../../models');
const sessionManager = require('../../utils/sessionManager');

// Test environment setup
process.env.JWT_SECRET = 'test-jwt-secret-for-middleware-testing';

describe('Authentication Middleware - authenticateToken', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            headers: {},
            ip: '127.0.0.1',
            path: '/api/test',
            get: jest.fn(() => 'Test-Agent')
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis()
        };
        next = jest.fn();

        // Reset all mocks
        jest.clearAllMocks();
    });

    describe('Missing Token', () => {
        it('should return 401 if no authorization header', async () => {
            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'MISSING_TOKEN'
                    })
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 if authorization header missing Bearer prefix', async () => {
            req.headers.authorization = 'InvalidTokenFormat';

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'MISSING_TOKEN'
                    })
                })
            );
        });
    });

    describe('Invalid Token', () => {
        it('should return 401 for invalid token format', async () => {
            req.headers.authorization = 'Bearer invalid.token.format';

            sessionManager.validateSession.mockResolvedValue({
                valid: false,
                error: 'Invalid token'
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'TOKEN_VERIFICATION_FAILED'
                    })
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 401 for expired token', async () => {
            const token = AuthUtils.generateAccessToken({ userId: '123' }, '-1h');
            req.headers.authorization = `Bearer ${token}`;

            sessionManager.validateSession.mockResolvedValue({
                valid: false,
                error: 'Token expired'
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'TOKEN_EXPIRED'
                    })
                })
            );
        });

        it('should return 401 for invalidated token', async () => {
            const token = AuthUtils.generateAccessToken({ userId: '123' });
            req.headers.authorization = `Bearer ${token}`;

            sessionManager.validateSession.mockResolvedValue({
                valid: false,
                error: 'Token invalidated'
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'TOKEN_INVALIDATED'
                    })
                })
            );
        });
    });

    // NOTE: User Not Found scenario is better tested in integration tests
    // where the actual sessionManager and database are used, avoiding
    // complex mocking issues with the sessionManager singleton instance

    describe('Inactive User', () => {
        it('should return 401 if user account is suspended', async () => {
            const userId = '123';
            const token = AuthUtils.generateAccessToken({ userId });
            req.headers.authorization = `Bearer ${token}`;

            sessionManager.validateSession.mockResolvedValue({
                valid: true,
                user: { userId },
                sessionId: 'session123'
            });

            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    _id: userId,
                    isActive: false,
                    role: 'rider'
                })
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'ACCOUNT_SUSPENDED'
                    })
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('Successful Authentication', () => {
        it('should authenticate valid token and attach user to request', async () => {
            const userId = '123';
            const mockUser = {
                _id: userId,
                phone: '+1234567890',
                role: 'rider',
                isActive: true,
                isVerified: true
            };
            const token = AuthUtils.generateAccessToken({ userId });
            req.headers.authorization = `Bearer ${token}`;

            sessionManager.validateSession.mockResolvedValue({
                valid: true,
                user: { userId },
                sessionId: 'session123'
            });

            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(req.user).toEqual(mockUser);
            expect(req.sessionId).toBe('session123');
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should handle token rotation and set new tokens in headers', async () => {
            const userId = '123';
            const mockUser = {
                _id: userId,
                phone: '+1234567890',
                role: 'rider',
                isActive: true
            };
            const token = AuthUtils.generateAccessToken({ userId });
            req.headers.authorization = `Bearer ${token}`;

            sessionManager.validateSession.mockResolvedValue({
                valid: true,
                user: { userId },
                sessionId: 'session123',
                newTokens: {
                    accessToken: 'new-access-token',
                    refreshToken: 'new-refresh-token'
                }
            });

            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(mockUser)
            });

            await authMiddleware.authenticateToken(req, res, next);

            expect(res.set).toHaveBeenCalledWith('X-New-Access-Token', 'new-access-token');
            expect(res.set).toHaveBeenCalledWith('X-New-Refresh-Token', 'new-refresh-token');
            expect(next).toHaveBeenCalled();
        });
    });
});

describe('Authorization Middleware - authorizeRoles', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: null
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    describe('requireRider', () => {
        it('should allow rider access', () => {
            req.user = { role: 'rider', isActive: true };

            authMiddleware.requireRider(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should deny driver access', () => {
            req.user = { role: 'driver', isActive: true };

            authMiddleware.requireRider(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    error: expect.objectContaining({
                        code: 'INSUFFICIENT_PERMISSIONS'
                    })
                })
            );
        });

        it('should deny if no user in request', () => {
            authMiddleware.requireRider(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe('requireDriver', () => {
        it('should allow driver access', () => {
            req.user = { role: 'driver', isActive: true };

            authMiddleware.requireDriver(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should deny rider access', () => {
            req.user = { role: 'rider', isActive: true };

            authMiddleware.requireDriver(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('requireRiderOrDriver', () => {
        it('should allow rider access', () => {
            req.user = { role: 'rider', isActive: true };

            authMiddleware.requireRiderOrDriver(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should allow driver access', () => {
            req.user = { role: 'driver', isActive: true };

            authMiddleware.requireRiderOrDriver(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should deny admin access', () => {
            req.user = { role: 'admin', isActive: true };

            authMiddleware.requireRiderOrDriver(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe('requireAdmin', () => {
        it('should allow admin access', () => {
            req.user = { role: 'admin', isActive: true };

            authMiddleware.requireAdmin(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('should deny rider access', () => {
            req.user = { role: 'rider', isActive: true };

            authMiddleware.requireAdmin(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        });
    });
});

describe('Verification Middleware - requireVerified', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: null
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();
    });

    it('should allow verified user', () => {
        req.user = {
            role: 'rider',
            isVerified: true,
            isActive: true
        };

        authMiddleware.requireVerified(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny unverified user', () => {
        req.user = {
            role: 'rider',
            isVerified: false,
            isActive: true
        };

        authMiddleware.requireVerified(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({
                    code: 'ACCOUNT_NOT_VERIFIED'
                })
            })
        );
    });

    it('should require authentication first', () => {
        authMiddleware.requireVerified(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

describe('Optional Authentication - optionalAuth', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            headers: {},
            get: jest.fn(() => 'Test-Agent')
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        next = jest.fn();

        jest.clearAllMocks();
    });

    it('should continue without token', async () => {
        await authMiddleware.optionalAuth(req, res, next);

        expect(req.user).toBeUndefined();
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should attach user if valid token provided', async () => {
        const userId = '123';
        const mockUser = {
            _id: userId,
            role: 'rider',
            isActive: true
        };
        const token = AuthUtils.generateAccessToken({ userId });
        req.headers.authorization = `Bearer ${token}`;

        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        });

        await authMiddleware.optionalAuth(req, res, next);

        expect(req.user).toEqual(mockUser);
        expect(next).toHaveBeenCalled();
    });

    it('should continue even with invalid token', async () => {
        req.headers.authorization = 'Bearer invalid-token';

        await authMiddleware.optionalAuth(req, res, next);

        expect(req.user).toBeUndefined();
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should ignore inactive users', async () => {
        const userId = '123';
        const inactiveUser = {
            _id: userId,
            role: 'rider',
            isActive: false
        };
        const token = AuthUtils.generateAccessToken({ userId });
        req.headers.authorization = `Bearer ${token}`;

        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(inactiveUser)
        });

        await authMiddleware.optionalAuth(req, res, next);

        expect(req.user).toBeUndefined();
        expect(next).toHaveBeenCalled();
    });
});

describe('Middleware Performance Tests', () => {
    let req, res, next;

    beforeEach(() => {
        const userId = '123';
        const mockUser = {
            _id: userId,
            role: 'rider',
            isActive: true,
            isVerified: true
        };
        const token = AuthUtils.generateAccessToken({ userId });

        req = {
            headers: { authorization: `Bearer ${token}` },
            ip: '127.0.0.1',
            path: '/api/test',
            get: jest.fn(() => 'Test-Agent'),
            user: mockUser
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis()
        };
        next = jest.fn();

        sessionManager.validateSession.mockResolvedValue({
            valid: true,
            user: { userId },
            sessionId: 'session123'
        });

        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        });
    });

    it('should execute authorization checks in less than 1ms', () => {
        const startTime = Date.now();

        authMiddleware.requireRider(req, res, next);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1);
    });

    it('should execute verification check in less than 1ms', () => {
        const startTime = Date.now();

        authMiddleware.requireVerified(req, res, next);

        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(1);
    });
});
