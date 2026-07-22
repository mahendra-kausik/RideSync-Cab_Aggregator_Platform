/**
 * Frontend Error Handling Utilities
 * Provides consistent error handling across the application
 */

import { ApiError } from '@/services/apiClient';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories
 */
export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  SERVER = 'server',
  CLIENT = 'client',
  UNKNOWN = 'unknown'
}

/**
 * Enhanced error interface
 */
export interface EnhancedError extends ApiError {
  severity: ErrorSeverity;
  category: ErrorCategory;
  userMessage: string;
  technicalMessage: string;
  suggestions?: string[];
  retryable: boolean;
}

/**
 * Error classification utility
 */
export class ErrorClassifier {
  /**
   * Classify an error and enhance it with additional metadata
   */
  static classify(error: ApiError | Error | any): EnhancedError {
    // Handle different error types
    let baseError: ApiError;

    if (error?.code && error?.message) {
      baseError = error as ApiError;
    } else if (error instanceof Error) {
      baseError = {
        code: 'CLIENT_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
        statusCode: 0
      };
    } else {
      baseError = {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        statusCode: 0
      };
    }

    // Classify the error
    const category = this.getErrorCategory(baseError);
    const severity = this.getErrorSeverity(baseError);
    const userMessage = this.getUserFriendlyMessage(baseError);
    const suggestions = this.getErrorSuggestions(baseError);
    const retryable = this.isRetryable(baseError);

    return {
      ...baseError,
      category,
      severity,
      userMessage,
      technicalMessage: baseError.message,
      suggestions,
      retryable
    };
  }

  /**
   * Get error category based on error code and status
   */
  private static getErrorCategory(error: ApiError): ErrorCategory {
    const { code, statusCode } = error;

    if (statusCode === 0 || code === 'NETWORK_ERROR') {
      return ErrorCategory.NETWORK;
    }

    if (statusCode === 401 || code.includes('AUTH')) {
      return ErrorCategory.AUTHENTICATION;
    }

    if (statusCode === 403 || code.includes('PERMISSION')) {
      return ErrorCategory.AUTHORIZATION;
    }

    if (statusCode === 400 || code.includes('VALIDATION')) {
      return ErrorCategory.VALIDATION;
    }

    if (statusCode >= 500) {
      return ErrorCategory.SERVER;
    }

    if (statusCode >= 400 && statusCode < 500) {
      return ErrorCategory.CLIENT;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Get error severity based on category and impact
   */
  private static getErrorSeverity(error: ApiError): ErrorSeverity {
    const { statusCode, code } = error;

    // Critical errors that prevent core functionality
    if (code === 'NETWORK_ERROR' || statusCode === 0) {
      return ErrorSeverity.CRITICAL;
    }

    if (statusCode >= 500) {
      return ErrorSeverity.HIGH;
    }

    if (statusCode === 401 || statusCode === 403) {
      return ErrorSeverity.HIGH;
    }

    if (statusCode === 429) {
      return ErrorSeverity.MEDIUM;
    }

    if (statusCode === 400) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Get user-friendly error message
   */
  private static getUserFriendlyMessage(error: ApiError): string {
    const { code, statusCode } = error;

    const messages: Record<string, string> = {
      NETWORK_ERROR: 'Unable to connect to the server. Please check your internet connection.',
      VALIDATION_ERROR: 'Please check your input and try again.',
      AUTHENTICATION_ERROR: 'Please log in to continue.',
      AUTHORIZATION_ERROR: 'You don\'t have permission to perform this action.',
      RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment and try again.',
      NOT_FOUND_ERROR: 'The requested resource was not found.',
      SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
      PAYMENT_FAILED: 'Payment could not be processed. Please try again.',
      RIDE_BOOKING_FAILED: 'Unable to book ride. Please try again.',
      DRIVER_NOT_FOUND: 'No drivers available in your area right now.',
      INVALID_COORDINATES: 'Please select valid pickup and destination locations.'
    };

    // Check specific error codes first
    if (messages[code]) {
      return messages[code];
    }

    // Fallback to status code based messages
    if (statusCode >= 500) {
      return 'Something went wrong on our end. Please try again later.';
    }

    if (statusCode === 404) {
      return 'The requested resource was not found.';
    }

    if (statusCode === 400) {
      return 'Please check your input and try again.';
    }

    return error.message || 'An unexpected error occurred.';
  }

  /**
   * Get actionable suggestions for the user
   */
  private static getErrorSuggestions(error: ApiError): string[] {
    const { code, statusCode } = error;

    const suggestions: Record<string, string[]> = {
      NETWORK_ERROR: [
        'Check your internet connection',
        'Try refreshing the page',
        'Contact support if the problem persists'
      ],
      VALIDATION_ERROR: [
        'Review the highlighted fields',
        'Ensure all required information is provided',
        'Check the format of your input'
      ],
      AUTHENTICATION_ERROR: [
        'Log in with your credentials',
        'Reset your password if needed',
        'Clear your browser cache and try again'
      ],
      RATE_LIMIT_EXCEEDED: [
        'Wait a few minutes before trying again',
        'Avoid rapid repeated requests',
        'Contact support if you need higher limits'
      ],
      DRIVER_NOT_FOUND: [
        'Try again in a few minutes',
        'Check if you\'re in a service area',
        'Consider adjusting your pickup location'
      ],
      PAYMENT_FAILED: [
        'Check your payment method details',
        'Ensure sufficient funds are available',
        'Try a different payment method'
      ]
    };

    if (suggestions[code]) {
      return suggestions[code];
    }

    if (statusCode >= 500) {
      return [
        'Try again in a few minutes',
        'Refresh the page',
        'Contact support if the issue continues'
      ];
    }

    return ['Try again', 'Contact support if the problem persists'];
  }

  /**
   * Check if error is retryable
   */
  private static isRetryable(error: ApiError): boolean {
    const { statusCode, code } = error;

    // Network errors are retryable
    if (statusCode === 0 || code === 'NETWORK_ERROR') {
      return true;
    }

    // Server errors are retryable
    if (statusCode >= 500) {
      return true;
    }

    // Rate limiting is retryable after delay
    if (statusCode === 429) {
      return true;
    }

    // Timeout errors are retryable
    if (code === 'TIMEOUT_ERROR') {
      return true;
    }

    // Client errors are generally not retryable
    return false;
  }
}

/**
 * Error reporting utility
 */
export class ErrorReporter {
  /**
   * Report error to external service (placeholder for production)
   */
  static report(error: EnhancedError, context?: any) {
    // In development, just log to console
    if (import.meta.env.DEV) {
      console.group('🚨 Error Report');
      console.error('Error:', error);
      console.log('Context:', context);
      console.groupEnd();
      return;
    }

    // In production, you would send this to an error reporting service
    // like Sentry, LogRocket, or Bugsnag
    const errorReport = {
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
        severity: error.severity,
        statusCode: error.statusCode,
        timestamp: error.timestamp
      },
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        ...context
      }
    };

    // Placeholder for actual error reporting
    console.log('Would report error:', errorReport);
  }
}

/**
 * Retry utility for failed operations
 */
export class RetryManager {
  /**
   * Retry an operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Check if error is retryable
        const enhancedError = ErrorClassifier.classify(error);
        if (!enhancedError.retryable) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Global error handler for unhandled promise rejections
 */
export function setupGlobalErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const error = ErrorClassifier.classify(event.reason);
    ErrorReporter.report(error, { type: 'unhandledRejection' });

    // Prevent the default browser error handling
    event.preventDefault();
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    const error = ErrorClassifier.classify(event.error);
    ErrorReporter.report(error, {
      type: 'globalError',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });
}

/**
 * Utility functions for common error scenarios
 */
export const ErrorUtils = {
  /**
   * Handle API response errors
   */
  handleApiError(error: any, context?: string): EnhancedError {
    const enhancedError = ErrorClassifier.classify(error);
    ErrorReporter.report(enhancedError, { context });
    return enhancedError;
  },

  /**
   * Create a user-friendly error message
   */
  createUserMessage(error: any): string {
    const enhancedError = ErrorClassifier.classify(error);
    return enhancedError.userMessage;
  },

  /**
   * Check if an operation should be retried
   */
  shouldRetry(error: any): boolean {
    const enhancedError = ErrorClassifier.classify(error);
    return enhancedError.retryable;
  },

  /**
   * Get error suggestions for the user
   */
  getErrorSuggestions(error: any): string[] {
    const enhancedError = ErrorClassifier.classify(error);
    return enhancedError.suggestions || [];
  }
};