import { useCallback, useState } from 'react';
import { ApiError } from '@/services/apiClient';

export interface ErrorState {
  error: ApiError | Error | null;
  isError: boolean;
  errorId: string | null;
}

export interface ErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  fallbackMessage?: string;
}

/**
 * Custom hook for centralized error handling
 */
export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    showToast = true,
    logError = true,
    fallbackMessage = 'An unexpected error occurred'
  } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorId: null
  });

  const handleError = useCallback((error: ApiError | Error | any, context?: string) => {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Normalize error object
    let normalizedError: ApiError;

    if (error?.code && error?.message) {
      // Already an ApiError
      normalizedError = error as ApiError;
    } else if (error instanceof Error) {
      // JavaScript Error
      normalizedError = {
        code: 'CLIENT_ERROR',
        message: error.message || fallbackMessage,
        timestamp: new Date().toISOString(),
        statusCode: 0
      };
    } else if (typeof error === 'string') {
      // String error
      normalizedError = {
        code: 'CLIENT_ERROR',
        message: error || fallbackMessage,
        timestamp: new Date().toISOString(),
        statusCode: 0
      };
    } else {
      // Unknown error format
      normalizedError = {
        code: 'UNKNOWN_ERROR',
        message: fallbackMessage,
        timestamp: new Date().toISOString(),
        statusCode: 0
      };
    }

    // Log error if enabled
    if (logError) {
      console.error(`🚨 Error Handler [${errorId}]:`, {
        error: normalizedError,
        context,
        timestamp: new Date().toISOString()
      });
    }

    // Update error state
    setErrorState({
      error: normalizedError,
      isError: true,
      errorId
    });

    // Show toast notification if enabled
    if (showToast) {
      showErrorToast(normalizedError);
    }

    return errorId;
  }, [showToast, logError, fallbackMessage]);

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorId: null
    });
  }, []);

  const retryOperation = useCallback(async (operation: () => Promise<any>) => {
    clearError();
    try {
      return await operation();
    } catch (error) {
      handleError(error, 'retry operation');
      throw error;
    }
  }, [handleError, clearError]);

  return {
    ...errorState,
    handleError,
    clearError,
    retryOperation
  };
}

/**
 * Show error toast notification
 */
function showErrorToast(error: ApiError) {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.innerHTML = `
    <div class="error-toast__content">
      <div class="error-toast__icon">⚠️</div>
      <div class="error-toast__message">
        <div class="error-toast__title">${getErrorTitle(error.code)}</div>
        <div class="error-toast__text">${error.message}</div>
      </div>
      <button class="error-toast__close" onclick="this.parentElement.parentElement.remove()">×</button>
    </div>
  `;

  // Add styles if not already present
  if (!document.getElementById('error-toast-styles')) {
    const styles = document.createElement('style');
    styles.id = 'error-toast-styles';
    styles.textContent = `
      .error-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        border-left: 4px solid #dc3545;
        animation: slideIn 0.3s ease-out;
      }

      .error-toast__content {
        display: flex;
        align-items: flex-start;
        padding: 16px;
        gap: 12px;
      }

      .error-toast__icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .error-toast__message {
        flex: 1;
      }

      .error-toast__title {
        font-weight: 600;
        color: #dc3545;
        margin-bottom: 4px;
      }

      .error-toast__text {
        color: #6c757d;
        font-size: 14px;
        line-height: 1.4;
      }

      .error-toast__close {
        background: none;
        border: none;
        font-size: 20px;
        color: #6c757d;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .error-toast__close:hover {
        background-color: #f8f9fa;
        color: #495057;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @media (max-width: 768px) {
        .error-toast {
          left: 20px;
          right: 20px;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(styles);
  }

  // Add to DOM
  document.body.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

/**
 * Get user-friendly error title based on error code
 */
function getErrorTitle(code: string): string {
  const titles: Record<string, string> = {
    VALIDATION_ERROR: 'Validation Error',
    AUTHENTICATION_ERROR: 'Authentication Failed',
    AUTHORIZATION_ERROR: 'Access Denied',
    NOT_FOUND_ERROR: 'Not Found',
    RATE_LIMIT_EXCEEDED: 'Too Many Requests',
    NETWORK_ERROR: 'Connection Error',
    SERVER_ERROR: 'Server Error',
    CLIENT_ERROR: 'Application Error',
    UNKNOWN_ERROR: 'Unexpected Error'
  };

  return titles[code] || 'Error';
}

/**
 * Hook for handling async operations with error handling
 */
export function useAsyncError() {
  const { handleError } = useErrorHandler();

  return useCallback((error: any) => {
    handleError(error, 'async operation');
  }, [handleError]);
}

/**
 * Higher-order function to wrap async functions with error handling
 */
export function withErrorHandling<T extends(...args: any[]) => Promise<any>>(
  asyncFn: T,
  errorHandler?: (error: any) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      if (errorHandler) {
        errorHandler(error);
      } else {
        console.error('🚨 Unhandled async error:', error);
      }
      throw error;
    }
  }) as T;
}