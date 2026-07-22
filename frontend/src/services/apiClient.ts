import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Extend the config interface to include metadata
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    retryCount: number;
  };
}

// Enhanced error types
export interface ApiError {
  code: string;
  message: string;
  details?: any[];
  timestamp: string;
  statusCode: number;
  retryAfter?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
};

// Create axios instance with base configuration
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request retry utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Request interceptor to add auth token and request ID
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request ID for tracking
    config.headers['X-Request-ID'] = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Add retry count
    (config as ExtendedAxiosRequestConfig).metadata = { retryCount: 0 };

    return config;
  },
  (error) => {
    console.error('🚨 Request configuration error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and retries
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Log successful requests in development
    if (import.meta.env.DEV) {
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    }

    // Backend silently rotates tokens once they cross its rotation threshold and
    // blacklists the old one — if we don't pick up the new token here, the very
    // next request gets rejected as invalidated, forcing an unwanted logout.
    const newAccessToken = response.headers['x-new-access-token'];
    if (newAccessToken) {
      localStorage.setItem('token', newAccessToken);
      window.dispatchEvent(new CustomEvent('auth:token-rotated', { detail: { token: newAccessToken } }));
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as ExtendedAxiosRequestConfig;

    // Extract error information
    const statusCode = error.response?.status || 0;
    const errorData = error.response?.data as any;

    // Log error details
    console.error(`🚨 API Error: ${originalRequest?.method?.toUpperCase()} ${originalRequest?.url} - ${statusCode}`);

    // Handle specific error cases
    if (statusCode === 401) {
      // Unauthorized - do not auto-logout/redirect; let callers handle gracefully
      console.warn('⚠️  Received 401 Unauthorized. Preserving session to avoid disruptive logouts.');
      return Promise.reject(createApiError(error));
    }

    // Handle rate limiting with retry after
    if (statusCode === 429) {
      const retryAfter = error.response?.headers['retry-after'] || errorData?.error?.retryAfter || 60;
      console.warn(`⏳ Rate limited. Retry after ${retryAfter} seconds`);

      return Promise.reject(createApiError(error));
    }

    // Retry logic for retryable errors
    if (shouldRetry(error, originalRequest)) {
      if (originalRequest.metadata) {
        originalRequest.metadata.retryCount += 1;
      }

      const delay = calculateRetryDelay(originalRequest.metadata?.retryCount || 0);
      console.log(`🔄 Retrying request (${originalRequest.metadata?.retryCount || 0}/${RETRY_CONFIG.maxRetries}) after ${delay}ms`);

      await sleep(delay);
      return apiClient(originalRequest);
    }

    // Handle network errors
    if (!error.response) {
      console.error('🌐 Network error - check your internet connection');
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Network error - please check your internet connection',
        statusCode: 0,
        timestamp: new Date().toISOString()
      });
    }

    return Promise.reject(createApiError(error));
  }
);

// Utility functions
function shouldRetry(error: AxiosError, config: any): boolean {
  if (!config || config.metadata.retryCount >= RETRY_CONFIG.maxRetries) {
    return false;
  }

  const status = error.response?.status || 0;
  return RETRY_CONFIG.retryableStatuses.includes(status);
}

function calculateRetryDelay(retryCount: number): number {
  // Exponential backoff with jitter
  const baseDelay = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount - 1);
  const jitter = Math.random() * 1000;
  return Math.min(baseDelay + jitter, 10000); // Max 10 seconds
}

function createApiError(error: AxiosError): ApiError {
  const errorData = error.response?.data as any;

  return {
    code: errorData?.error?.code || 'API_ERROR',
    message: errorData?.error?.message || error.message || 'An unexpected error occurred',
    details: errorData?.error?.details,
    timestamp: errorData?.error?.timestamp || new Date().toISOString(),
    statusCode: error.response?.status || 0,
    retryAfter: errorData?.error?.retryAfter
  };
}

// Enhanced API client with error handling
export const api = {
  // Generic request method with error handling
  async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await apiClient(config);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error as ApiError
      };
    }
  },

  // Convenience methods
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  },

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  },

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  },

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  },

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const response = await apiClient.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
};

export { apiClient };