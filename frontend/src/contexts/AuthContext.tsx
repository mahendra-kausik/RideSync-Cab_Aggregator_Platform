import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, ApiResponse } from '../types';
import { authService } from '../services/authService';

// Auth Actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'UPDATE_TOKEN'; payload: string };

// Auth Context Type
interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<ApiResponse>;
  logout: () => void;
  register: (credentials: LoginCredentials) => Promise<ApiResponse>;
  verifyOTP: (phone: string, otp: string, password: string) => Promise<ApiResponse>;
  updateUser: (user: User) => void;
  checkAuthStatus: () => Promise<void>;
}

// Initial State
const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: false,
  isLoading: true,
};

// Auth Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false,
      };
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
      };
    case 'UPDATE_TOKEN':
      return {
        ...state,
        token: action.payload,
      };
    default:
      return state;
  }
};

// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on app load
  const checkAuthStatus = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }

    const response = await authService.verifyToken(token);
    if (response.success && response.data) {
      localStorage.setItem('user', JSON.stringify(response.data.user));
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user: response.data.user,
          token: token,
        },
      });
    } else if (response.indeterminate) {
      // Network error or backend hiccup — we don't actually know the token is
      // bad. Restore optimistically from the last-known user profile and let
      // the user through; a real API call will 401 and trigger a refresh if
      // the token is genuinely dead.
      const cachedUser = localStorage.getItem('user');
      if (cachedUser) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user: JSON.parse(cachedUser), token },
        });
      } else {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      dispatch({ type: 'AUTH_FAILURE', payload: 'Invalid token' });
    }
  };

  // Login function
  const login = async (credentials: LoginCredentials): Promise<ApiResponse> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.login(credentials);

      if (response.success && response.data) {
        const { user, token, refreshToken } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user, token },
        });
      } else {
        dispatch({ type: 'AUTH_FAILURE', payload: response.error?.message || 'Login failed' });
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
      return {
        success: false,
        error: {
          code: 'LOGIN_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  };

  // Register function
  const register = async (credentials: LoginCredentials): Promise<ApiResponse> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.register(credentials);

      if (!response.success) {
        dispatch({ type: 'AUTH_FAILURE', payload: response.error?.message || 'Registration failed' });
      } else {
        // Registration success only completes the phone step (OTP verification logs
        // the user in) — clear loading so the app isn't stuck showing a spinner
        dispatch({ type: 'SET_LOADING', payload: false });
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
      return {
        success: false,
        error: {
          code: 'REGISTRATION_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  };

  // Verify OTP function
  const verifyOTP = async (phone: string, otp: string, password: string): Promise<ApiResponse> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.verifyOTP(phone, otp, password);

      if (response.success && response.data) {
        const { user, token, refreshToken } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: { user, token },
        });
      } else {
        dispatch({ type: 'AUTH_FAILURE', payload: response.error?.message || 'OTP verification failed' });
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OTP verification failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
      return {
        success: false,
        error: {
          code: 'OTP_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  };

  // Logout function — revokes the session server-side (best-effort), then
  // always clears local state regardless of whether the network call succeeded.
  const logout = () => {
    authService.logout().catch(() => {
      // Ignore — e.g. offline. Local tokens are cleared below either way.
    });
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('currentRideId');
    dispatch({ type: 'LOGOUT' });
  };

  // Update user function
  const updateUser = (user: User) => {
    dispatch({ type: 'UPDATE_USER', payload: user });
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Keep context state in sync when apiClient picks up a silently-rotated token
  useEffect(() => {
    const handleTokenRotated = (e: Event) => {
      const token = (e as CustomEvent<{ token: string }>).detail?.token;
      if (token) {
        dispatch({ type: 'UPDATE_TOKEN', payload: token });
      }
    };
    window.addEventListener('auth:token-rotated', handleTokenRotated);
    return () => window.removeEventListener('auth:token-rotated', handleTokenRotated);
  }, []);

  // apiClient dispatches this when a 401's refresh attempt itself fails
  // (refresh token dead/reused) — treat it as a real logout.
  useEffect(() => {
    const handleSessionExpired = () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      dispatch({ type: 'LOGOUT' });
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    register,
    verifyOTP,
    updateUser,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};