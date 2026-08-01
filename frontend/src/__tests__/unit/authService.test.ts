/**
 * Unit Tests - Auth Service
 * Tests authentication service methods with mocked API calls
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '@/services/authService';
import { apiClient } from '@/services/apiClient';

// Mock the API client
vi.mock('@/services/apiClient', () => ({
    apiClient: {
        post: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
    },
}));

describe('AuthService - Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('register', () => {
        it('should successfully register a user with phone', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    message: 'OTP sent successfully',
                },
            };

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

            const result = await authService.register({
                phone: '+1234567890',
                name: 'Test User',
                role: 'rider',
            });

            expect(result.success).toBe(true);
            expect(apiClient.post).toHaveBeenCalledWith('/auth/register-phone', {
                phone: '+1234567890',
                role: 'rider',
                profile: { name: 'Test User' },
            });
        });

        it('should handle registration errors', async () => {
            const mockError = {
                response: {
                    data: {
                        error: {
                            message: 'Phone already registered',
                        },
                    },
                },
            };

            vi.mocked(apiClient.post).mockRejectedValue(mockError);

            const result = await authService.register({
                phone: '+1234567890',
                name: 'Test User',
            });

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Phone already registered');
        });
    });

    describe('verifyOTP', () => {
        it('should successfully verify OTP and return user data', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        user: {
                            id: '123',
                            phone: '+1234567890',
                            role: 'rider',
                        },
                        tokens: {
                            accessToken: 'mock-token-123',
                        },
                    },
                },
            };

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

            const result = await authService.verifyOTP(
                '+1234567890',
                '123456',
                'password123'
            );

            expect(result.success).toBe(true);
            expect(result.data?.user.phone).toBe('+1234567890');
            expect(result.data?.token).toBe('mock-token-123');
        });

        it('should handle invalid OTP errors', async () => {
            const mockError = {
                response: {
                    data: {
                        error: {
                            message: 'Invalid OTP',
                        },
                    },
                },
            };

            vi.mocked(apiClient.post).mockRejectedValue(mockError);

            const result = await authService.verifyOTP('+1234567890', '000000', 'password123');

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Invalid OTP');
        });
    });

    describe('login', () => {
        it('should successfully login with phone and password', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    data: {
                        user: {
                            id: '123',
                            phone: '+1234567890',
                            role: 'rider',
                        },
                        tokens: {
                            accessToken: 'mock-token-456',
                        },
                    },
                },
            };

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

            const result = await authService.login({
                phone: '+1234567890',
                password: 'password123',
                role: 'rider',
            });

            expect(result.success).toBe(true);
            expect(result.data?.token).toBe('mock-token-456');
        });

        it('should handle invalid credentials', async () => {
            const mockError = {
                response: {
                    data: {
                        error: {
                            message: 'Invalid credentials',
                        },
                    },
                },
            };

            vi.mocked(apiClient.post).mockRejectedValue(mockError);

            const result = await authService.login({
                phone: '+1234567890',
                password: 'wrongpassword',
            });

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe('Invalid credentials');
        });
    });

    describe('forgotPassword', () => {
        it('should successfully send password reset email', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    message: 'Password reset email sent',
                },
            };

            vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

            const result = await authService.forgotPassword('test@example.com');

            expect(result.success).toBe(true);
            expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
                email: 'test@example.com',
            });
        });
    });
});
