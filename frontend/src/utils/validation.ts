/**
 * Validation utility functions
 */

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
    const phoneRegex = /^\+?[\d\s\-()]{10,}$/;
    return phoneRegex.test(phone);
};

/**
 * Validate password strength
 */
export const isValidPassword = (password: string): boolean => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
};

/**
 * Validate OTP format (6 digits)
 */
export const isValidOTP = (otp: string): boolean => {
    const otpRegex = /^\d{6}$/;
    return otpRegex.test(otp);
};

/**
 * Validate coordinates
 */
export const isValidCoordinates = (lat: number, lng: number): boolean => {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
};

/**
 * Validate required field
 */
export const isRequired = (value: string | null | undefined): boolean => {
    return value !== null && value !== undefined && value.trim().length > 0;
};

/**
 * Validate minimum length
 */
export const hasMinLength = (value: string, minLength: number): boolean => {
    return value.length >= minLength;
};

/**
 * Validate maximum length
 */
export const hasMaxLength = (value: string, maxLength: number): boolean => {
    return value.length <= maxLength;
};

/**
 * Form validation helper
 */
export interface ValidationRule {
    validator: (value: any) => boolean;
    message: string;
}

export const validateField = (value: any, rules: ValidationRule[]): string | null => {
    for (const rule of rules) {
        if (!rule.validator(value)) {
            return rule.message;
        }
    }
    return null;
};

/**
 * Common validation rules
 */
export const validationRules = {
    required: (message = 'This field is required'): ValidationRule => ({
        validator: isRequired,
        message,
    }),
    email: (message = 'Please enter a valid email address'): ValidationRule => ({
        validator: isValidEmail,
        message,
    }),
    phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
        validator: isValidPhoneNumber,
        message,
    }),
    password: (message = 'Password must be at least 8 characters with uppercase, lowercase, and number'): ValidationRule => ({
        validator: isValidPassword,
        message,
    }),
    otp: (message = 'Please enter a valid 6-digit code'): ValidationRule => ({
        validator: isValidOTP,
        message,
    }),
    minLength: (length: number, message?: string): ValidationRule => ({
        validator: (value: string) => hasMinLength(value, length),
        message: message || `Must be at least ${length} characters`,
    }),
    maxLength: (length: number, message?: string): ValidationRule => ({
        validator: (value: string) => hasMaxLength(value, length),
        message: message || `Must be no more than ${length} characters`,
    }),
};