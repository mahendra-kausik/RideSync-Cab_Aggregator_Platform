/**
 * Integration Tests - Form Validation
 * Tests form components with validation logic
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock login form component for testing
const MockLoginForm = ({ onSubmit }: { onSubmit: (data: any) => void }) => {
    const [phone, setPhone] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const validate = () => {
        const newErrors: Record<string, string> = {};

        if (!phone) {
            newErrors.phone = 'Phone number is required';
        } else if (!/^\+?[\d\s\-()]{10,}$/.test(phone)) {
            newErrors.phone = 'Invalid phone number format';
        }

        if (!password) {
            newErrors.password = 'Password is required';
        } else if (password.length < 8) {
            newErrors.password = 'Password must be at least 8 characters';
        }

        return newErrors;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const validationErrors = validate();

        if (Object.keys(validationErrors).length === 0) {
            setErrors({}); // Clear errors on successful validation
            onSubmit({ phone, password });
        } else {
            setErrors(validationErrors);
        }
    }; return (
        <form onSubmit={handleSubmit} data-testid="login-form">
            <div>
                <input
                    type="tel"
                    placeholder="Phone Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="phone-input"
                />
                {errors.phone && <span role="alert">{errors.phone}</span>}
            </div>

            <div>
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="password-input"
                />
                {errors.password && <span role="alert">{errors.password}</span>}
            </div>

            <button type="submit">Sign In</button>
        </form>
    );
};

describe('Form Validation - Integration Tests', () => {
    it('should show validation errors when submitting empty form', async () => {
        const mockSubmit = vi.fn();
        render(<MockLoginForm onSubmit={mockSubmit} />);

        const submitButton = screen.getByText('Sign In');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/phone.*required/i)).toBeInTheDocument();
            expect(screen.getByText(/password.*required/i)).toBeInTheDocument();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('should show error for invalid phone format', async () => {
        const mockSubmit = vi.fn();
        render(<MockLoginForm onSubmit={mockSubmit} />);

        const phoneInput = screen.getByTestId('phone-input');
        const passwordInput = screen.getByTestId('password-input');

        fireEvent.change(phoneInput, { target: { value: '123' } });
        fireEvent.change(passwordInput, { target: { value: 'ValidPass123' } });

        const submitButton = screen.getByText('Sign In');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/invalid.*phone/i)).toBeInTheDocument();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('should show error for short password', async () => {
        const mockSubmit = vi.fn();
        render(<MockLoginForm onSubmit={mockSubmit} />);

        const phoneInput = screen.getByTestId('phone-input');
        const passwordInput = screen.getByTestId('password-input');

        fireEvent.change(phoneInput, { target: { value: '+1234567890' } });
        fireEvent.change(passwordInput, { target: { value: 'short' } });

        const submitButton = screen.getByText('Sign In');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/password.*8.*character/i)).toBeInTheDocument();
        });

        expect(mockSubmit).not.toHaveBeenCalled();
    });

    it('should submit form with valid data', async () => {
        const mockSubmit = vi.fn();
        render(<MockLoginForm onSubmit={mockSubmit} />);

        const phoneInput = screen.getByTestId('phone-input');
        const passwordInput = screen.getByTestId('password-input');

        fireEvent.change(phoneInput, { target: { value: '+1234567890' } });
        fireEvent.change(passwordInput, { target: { value: 'ValidPass123' } });

        const submitButton = screen.getByText('Sign In');
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockSubmit).toHaveBeenCalledWith({
                phone: '+1234567890',
                password: 'ValidPass123',
            });
        });

        // No error messages should be displayed
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should clear errors when valid input is provided', async () => {
        const mockSubmit = vi.fn();
        render(<MockLoginForm onSubmit={mockSubmit} />);

        const phoneInput = screen.getByTestId('phone-input');
        const submitButton = screen.getByText('Sign In');

        // Submit with empty phone to trigger error
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText(/phone.*required/i)).toBeInTheDocument();
        });

        // Enter valid phone
        fireEvent.change(phoneInput, { target: { value: '+1234567890' } });

        // Enter valid password and submit
        const passwordInput = screen.getByTestId('password-input');
        fireEvent.change(passwordInput, { target: { value: 'ValidPass123' } });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.queryByText(/phone.*required/i)).not.toBeInTheDocument();
            expect(mockSubmit).toHaveBeenCalled();
        });
    });
});
