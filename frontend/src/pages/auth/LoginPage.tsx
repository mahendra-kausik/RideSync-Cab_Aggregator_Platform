import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import './AuthPages.css';

const LoginPage: React.FC = () => {
  const [loginType, setLoginType] = useState<'phone' | 'email'>('phone');
  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleLoginTypeChange = (type: 'phone' | 'email') => {
    setLoginType(type);
    setFormData({
      phone: '',
      email: '',
      password: '',
    });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await login(formData);
      if (response.success && response.data?.user) {
        // Redirect based on user role
        const userRole = response.data.user.role;
        let redirectPath = from;

        // If coming from root or login, redirect to role-specific dashboard
        if (from === '/' || from === '/login') {
          switch (userRole) {
            case 'admin':
              redirectPath = '/admin/dashboard';
              break;
            case 'driver':
              redirectPath = '/driver/dashboard';
              break;
            case 'rider':
              redirectPath = '/rider/book';
              break;
            default:
              redirectPath = '/';
          }
        }

        navigate(redirectPath, { replace: true });
      } else {
        setError(response.error?.message || 'Login failed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Signing in..." />;
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🚗 Cab Aggregator</h1>
          <h2>Sign In</h2>
          <p>Welcome back! Please sign in to your account.</p>
        </div>

        <div className="login-type-selector">
          <button
            type="button"
            className={`login-type-btn ${loginType === 'phone' ? 'active' : ''}`}
            onClick={() => handleLoginTypeChange('phone')}
          >
            Phone Login
          </button>
          <button
            type="button"
            className={`login-type-btn ${loginType === 'email' ? 'active' : ''}`}
            onClick={() => handleLoginTypeChange('email')}
          >
            Admin Login
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          {loginType === 'phone' ? (
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                title="10-digit phone number, no country code or symbols"
                placeholder="1234567890"
              />
            </div>
          ) : (
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Enter your email"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password"
            />
          </div>

          <button type="submit" className="auth-button" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          {loginType === 'phone' && (
            <p>
              Don't have an account?{' '}
              <Link to="/register" className="auth-link">
                Sign up here
              </Link>
            </p>
          )}
          <p>
            <Link to="/forgot-password" className="auth-link">
              Forgot your password?
            </Link>
          </p>
        </div>

        {loginType === 'phone' && (
          <div className="demo-info">
            <h3>Demo Accounts</h3>
            <p><strong>Rider:</strong> 1234567890 / demoRider123</p>
            <p><strong>Driver:</strong> 1234567899 / demoDriver123</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;