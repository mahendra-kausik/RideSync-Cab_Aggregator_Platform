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
  verifyOTP: (phone: string, otp: string, password: string, tempUserData?: any) => Promise<ApiResponse>;
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

    try {
      const response = await authService.verifyToken(token);
      if (response.success && response.data) {
        dispatch({
          type: 'AUTH_SUCCESS',
          payload: {
            user: response.data.user,
            token: token,
          },
        });
      } else {
        localStorage.removeItem('token');
        dispatch({ type: 'AUTH_FAILURE', payload: 'Invalid token' });
      }
    } catch (error) {
      localStorage.removeItem('token');
      dispatch({ type: 'AUTH_FAILURE', payload: 'Token verification failed' });
    }
  };

  // Login function
  const login = async (credentials: LoginCredentials): Promise<ApiResponse> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.login(credentials);

      if (response.success && response.data) {
        const { user, token } = response.data;
        localStorage.setItem('token', token);
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
  const verifyOTP = async (phone: string, otp: string, password: string, tempUserData?: any): Promise<ApiResponse> => {
    dispatch({ type: 'AUTH_START' });

    try {
      const response = await authService.verifyOTP(phone, otp, password, tempUserData);

      if (response.success && response.data) {
        const { user, token } = response.data;
        localStorage.setItem('token', token);
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

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
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