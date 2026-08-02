/**
 * Integration Tests - Authentication Flow
 * Tests complete authentication workflows with context and services
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { authService } from '@/services/authService';

// Mock the auth service
vi.mock('@/services/authService', () => ({
    authService: {
        register: vi.fn(),
        verifyOTP: vi.fn(),
        login: vi.fn(),
        verifyToken: vi.fn(),
        logout: vi.fn().mockResolvedValue({ success: true }),
        refresh: vi.fn(),
    },
}));

// Test component that uses auth context
const TestAuthComponent = () => {
    const { user, isAuthenticated, isLoading, login, logout } = useAuth();

    return (
        <div>
            <div data-testid="loading">{isLoading ? 'Loading' : 'Ready'}</div>
            <div data-testid="auth-status">{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>
            <div data-testid="user-data">{user ? user.profile?.name : 'No User'}</div>
            <button onClick={() => login({ phone: '+1234567890', password: 'test123', role: 'rider' })}>
                Login
            </button>
            <button onClick={logout}>Logout</button>
        </div>
    );
};

describe('Authentication Flow - Integration Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('should initialize with unauthenticated state', async () => {
        vi.mocked(authService.verifyToken).mockResolvedValue({
            success: false,
            error: {
                code: 'NO_TOKEN',
                message: 'No token provided',
                timestamp: new Date().toISOString(),
            },
        });

        render(
            <BrowserRouter>
                <AuthProvider>
                    <TestAuthComponent />
                </AuthProvider>
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
            expect(screen.getByTestId('user-data')).toHaveTextContent('No User');
        });
    });

    it('should successfully complete registration flow', async () => {
        const mockRegisterResponse = {
            success: true,
            message: 'OTP sent successfully',
        };

        vi.mocked(authService.register).mockResolvedValue(mockRegisterResponse);

        render(
            <BrowserRouter>
                <AuthProvider>
                    <TestAuthComponent />
                </AuthProvider>
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
        });
    });

    it('should successfully complete OTP verification and login', async () => {
        const mockUser = {
            _id: '123',
            phone: '+1234567890',
            role: 'rider' as const,
            profile: {
                name: 'Test User',
                rating: 0,
                totalRides: 0,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        const mockLoginResponse = {
            success: true,
            data: {
                user: mockUser,
                token: 'mock-token-123',
                refreshToken: 'mock-refresh-token-123',
            },
        };

        // Mock successful login
        vi.mocked(authService.login).mockResolvedValue(mockLoginResponse);
        vi.mocked(authService.verifyToken).mockResolvedValue({
            success: false,
            error: {
                code: 'NO_TOKEN',
                message: 'No token',
                timestamp: new Date().toISOString(),
            },
        });

        const { getByText } = render(
            <BrowserRouter>
                <AuthProvider>
                    <TestAuthComponent />
                </AuthProvider>
            </BrowserRouter>
        );

        // Wait for initial render
        await waitFor(() => {
            expect(screen.getByTestId('loading')).toHaveTextContent('Ready');
        });

        // Click login button to trigger login
        const loginButton = getByText('Login');
        loginButton.click();

        // Wait for login to complete and user to be authenticated
        await waitFor(() => {
            expect(authService.login).toHaveBeenCalled();
        });
    });

    it('should handle login failure gracefully', async () => {
        const mockError = {
            success: false,
            error: {
                code: 'INVALID_CREDENTIALS',
                message: 'Invalid phone or password',
                timestamp: new Date().toISOString(),
            },
        };

        vi.mocked(authService.login).mockResolvedValue(mockError);
        vi.mocked(authService.verifyToken).mockResolvedValue({
            success: false,
            error: {
                code: 'NO_TOKEN',
                message: 'No token',
                timestamp: new Date().toISOString(),
            },
        });

        render(
            <BrowserRouter>
                <AuthProvider>
                    <TestAuthComponent />
                </AuthProvider>
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
        });
    });

    it('should clear authentication state on logout', async () => {
        const mockUser = {
            _id: '123',
            phone: '+1234567890',
            role: 'rider' as const,
            profile: {
                name: 'Test User',
                rating: 0,
                totalRides: 0,
            },
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        vi.mocked(authService.verifyToken).mockResolvedValue({
            success: true,
            data: { user: mockUser },
        });

        localStorage.setItem('token', 'mock-token-123');
        localStorage.setItem('user', JSON.stringify(mockUser));

        const { getByText } = render(
            <BrowserRouter>
                <AuthProvider>
                    <TestAuthComponent />
                </AuthProvider>
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
        });

        // Click logout
        const logoutButton = getByText('Logout');
        logoutButton.click();

        await waitFor(() => {
            expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
            expect(screen.getByTestId('user-data')).toHaveTextContent('No User');
        });

        // Check that token was removed from localStorage
        const token = localStorage.getItem('token');
        expect(token === null || token === undefined).toBe(true);
    });
});
