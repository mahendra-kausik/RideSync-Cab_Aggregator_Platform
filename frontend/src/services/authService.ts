import { LoginCredentials, ApiResponse, User } from '@/types';
import { apiClient } from './apiClient';

class AuthService {
  // Register with phone number
  async register(credentials: LoginCredentials): Promise<ApiResponse> {
    try {
      const payload: any = {
        phone: credentials.phone,
        role: credentials.role || 'rider',
        profile: {
          name: credentials.name
        }
      };

      // Add driver-specific information if role is driver
      if (credentials.role === 'driver') {
        payload.driverInfo = {
          licenseNumber: credentials.licenseNumber,
          vehicleDetails: {
            make: credentials.vehicleMake,
            model: credentials.vehicleModel,
            plateNumber: credentials.vehiclePlateNumber,
            color: credentials.vehicleColor
          }
        };
      }

      const response = await apiClient.post('/auth/register-phone', payload);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: error.response?.data?.error?.message || 'Registration failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Verify OTP
  async verifyOTP(phone: string, otp: string, password: string): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      const response = await apiClient.post('/auth/verify-otp', {
        phone,
        otp,
        password
      });

      // Transform the response to match expected format
      if (response.data.success && response.data.data) {
        return {
          ...response.data,
          data: {
            user: response.data.data.user,
            token: response.data.data.tokens.accessToken // Extract accessToken as token
          }
        };
      }

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'OTP_ERROR',
          message: error.response?.data?.error?.message || 'OTP verification failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Login with email/password (for admin users) or phone/password (for riders/drivers)
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      // Determine login endpoint based on credentials
      const isPhoneLogin = credentials.phone && !credentials.email;
      const endpoint = isPhoneLogin ? '/auth/login-phone' : '/auth/login-email';
      const payload = isPhoneLogin
        ? { phone: credentials.phone, password: credentials.password }
        : { email: credentials.email, password: credentials.password };

      const response = await apiClient.post(endpoint, payload);

      // Transform the response to match expected format
      if (response.data.success && response.data.data) {
        return {
          ...response.data,
          data: {
            user: response.data.data.user,
            token: response.data.data.tokens.accessToken // Extract accessToken as token
          }
        };
      }

      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'LOGIN_ERROR',
          message: error.response?.data?.error?.message || 'Login failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Verify token
  async verifyToken(token: string): Promise<ApiResponse<{ user: User }>> {
    try {
      const response = await apiClient.get('/auth/verify', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'TOKEN_ERROR',
          message: error.response?.data?.error?.message || 'Token verification failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Forgot password
  async forgotPassword(email: string): Promise<ApiResponse> {
    try {
      const response = await apiClient.post('/auth/forgot-password', {
        email,
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'FORGOT_PASSWORD_ERROR',
          message: error.response?.data?.error?.message || 'Password reset failed',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  // Get OTP for development (dev-only endpoint)
  async getDevOTP(phone: string): Promise<ApiResponse<{ otp: string }>> {
    if (!import.meta.env.DEV) {
      return {
        success: false,
        error: {
          code: 'DEV_ONLY_ERROR',
          message: 'This endpoint is only available in development mode',
          timestamp: new Date().toISOString(),
        },
      };
    }

    try {
      const response = await apiClient.get(`/auth/dev/otp/${phone}`);
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'DEV_OTP_ERROR',
          message: error.response?.data?.error?.message || 'Failed to get dev OTP',
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}

export const authService = new AuthService();